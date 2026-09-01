import { createFileRoute, notFound } from "@tanstack/react-router";

export const Route = createFileRoute("/platform")({
  beforeLoad: () => {
    throw notFound();
  },
  component: () => null,
});
