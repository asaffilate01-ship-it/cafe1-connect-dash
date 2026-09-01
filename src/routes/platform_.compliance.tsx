import { createFileRoute, notFound } from "@tanstack/react-router";

export const Route = createFileRoute("/platform_/compliance")({
  beforeLoad: () => {
    throw notFound();
  },
  component: () => null,
});
