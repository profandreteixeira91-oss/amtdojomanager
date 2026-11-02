import { createFileRoute } from "@tanstack/react-router";
import { CertificateStudio } from "@/components/dojo/certificates-studio/CertificateStudio";

export const Route = createFileRoute("/dojo/certificate-editor/$id")({
  head: () => ({ meta: [{ title: "Editor de Certificados — AMT Dojo Manager" }] }),
  // `preset`: modelo pronto escolhido na tela inicial ao criar um novo modelo.
  validateSearch: (search: Record<string, unknown>): { preset?: string } => ({
    preset: typeof search.preset === "string" ? search.preset : undefined,
  }),
  component: EditorPage,
});

function EditorPage() {
  const { id } = Route.useParams();
  const { preset } = Route.useSearch();
  return <CertificateStudio templateId={id as any} presetId={preset} />;
}
