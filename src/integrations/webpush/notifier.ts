import type { PushNotifier } from "@/domain/push";
import type { Logger } from "@/lib/logger";
import { newCorrelationId as defaultCorrelationId } from "@/lib/logger";
import { loggable } from "./log";
import type { PushDelivery } from "./deliver";

export type PushNotifierDeps = {
  /** Runs the task after the response (`after` in Next). Its own failures are caught here. */
  schedule: (task: () => Promise<void>) => void;
  /**
   * Builds the delivery when the task runs, not when the notifier is made: secrets are read after
   * the response, like the trade emails, so a deploy without them only skips alerts.
   */
  delivery: () => PushDelivery;
  logger: Logger;
  newCorrelationId?: () => string;
};

/**
 * The `PushNotifier` port a feature calls. `notify` returns at once and never throws, so an alert
 * problem can neither slow an action nor change its result: scheduling, building the alerts and
 * delivering them are each guarded, and every failure is logged.
 */
export function createPushNotifier(deps: PushNotifierDeps): PushNotifier {
  const newCorrelationId = deps.newCorrelationId ?? defaultCorrelationId;

  return {
    notify(build) {
      // One id for the whole notify: the build, the delivery and any failure share it.
      const correlationId = newCorrelationId();
      const log = deps.logger.child({ correlationId });
      try {
        deps.schedule(async () => {
          try {
            const alerts = await build();
            // Nothing to send: never touch the environment or the database for it.
            if (alerts.length === 0) return;
            await deps.delivery().deliver(alerts, { correlationId });
          } catch (error) {
            log.error("push alerts failed", { error: loggable(error) });
          }
        });
      } catch (error) {
        log.error("push alerts could not be scheduled", { error: loggable(error) });
      }
    },
  };
}
