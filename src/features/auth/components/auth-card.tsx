import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader } from "@/ui/card";

/** Frame shared by every auth screen: one card, heading, description, footer link. */
export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <h1 className="font-heading text-3xl leading-none font-extrabold">{title}</h1>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
      {footer ? <p className="px-4 text-center text-sm text-text-muted">{footer}</p> : null}
    </Card>
  );
}
