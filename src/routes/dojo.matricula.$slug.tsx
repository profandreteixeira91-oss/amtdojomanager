import { createFileRoute } from "@tanstack/react-router";
import { PublicEnrollmentPage, enrollmentHead, loadEnrollmentBundle } from "./matricula.$slug";

export const Route = createFileRoute("/dojo/matricula/$slug")({
  loader: ({ params }) => loadEnrollmentBundle(params.slug),
  head: ({ loaderData }) => enrollmentHead(loaderData),
  component: PublicEnrollmentPage,
});
