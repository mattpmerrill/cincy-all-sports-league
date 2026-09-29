import type { Metadata } from "next";
import { getCurrentUser } from "@/features/auth/guards";
import { FeedList } from "@/features/feed/components/feed-list";
import type { FeedActions } from "@/features/feed/feed-actions";
import { PageHeader, PageMain } from "@/ui/page";
import {
  deleteMessageAction,
  loadMessageAction,
  loadOlderAction,
  postMessageAction,
  reactAction,
  replyAction,
} from "./actions";

export const metadata: Metadata = { title: "Feed" };

const actions: FeedActions = {
  post: postMessageAction,
  reply: replyAction,
  react: reactAction,
  remove: deleteMessageAction,
  loadOlder: loadOlderAction,
  loadMessage: loadMessageAction,
};

export default async function FeedPage() {
  const user = await getCurrentUser();
  return (
    <PageMain>
      <PageHeader title="Feed" description="Trash talk and live score updates from the league." />
      <FeedList user={user} actions={actions} />
    </PageMain>
  );
}
