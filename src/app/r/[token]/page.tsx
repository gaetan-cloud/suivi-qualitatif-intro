import FeedbackForm from "./FeedbackForm";

export default async function TokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <FeedbackForm token={token} />;
}
