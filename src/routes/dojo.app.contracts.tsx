import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { Scale, LayoutGrid, FileText, FolderTree } from "lucide-react";
import { PinGate } from "@/components/dojo/PinGate";
import { DojoPageHero, SUBNAV_CLS, SUBNAV_ROW_CLS, subnavItemClass } from "@/components/dojo/DojoPageHero";

export const Route = createFileRoute("/dojo/app/contracts")({
  head: () => ({
    meta: [
      { title: "Central de Contratos — AMT Dojo Manager" },
      { name: "description", content: "Módulo jurídico completo: modelos versionados, contratos emitidos, timeline e dashboard." },
      { property: "og:title", content: "Central de Contratos — AMT Dojo Manager" },
      { property: "og:description", content: "Gestão jurídica centralizada de contratos e modelos do dojo." },
    ],
  }),
  component: ContractsShell,
});

function ContractsShell() {
  const loc = useLocation();
  const tab = (() => {
    if (loc.pathname.includes("/contracts/templates")) return "templates";
    if (loc.pathname.includes("/contracts/issued")) return "issued";
    return "dashboard";
  })();

  return (
    <PinGate
      moduleName="Central de Contratos"
      description="A Central de Contratos contém dados jurídicos sensíveis. Digite seu PIN de 6 dígitos para liberar o acesso por 24 horas."
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 md:gap-7">
        <DojoPageHero
          icon={Scale}
          eyebrow="Jurídico"
          title="Central de Contratos"
          description="Módulo jurídico — modelos versionados, emissões, timeline e ciclo de vida completo."
          footer={
            <nav className={SUBNAV_CLS} aria-label="Seções de contratos">
              <div className={SUBNAV_ROW_CLS}>
                <Link to="/dojo/app/contracts" className={subnavItemClass(tab === "dashboard")}>
                  <LayoutGrid /> Painel
                </Link>
                <Link to="/dojo/app/contracts/templates" className={subnavItemClass(tab === "templates")}>
                  <FolderTree /> Modelos
                </Link>
                <Link to="/dojo/app/contracts/issued" className={subnavItemClass(tab === "issued")}>
                  <FileText /> Emitidos
                </Link>
              </div>
            </nav>
          }
        />

        <Outlet />
      </div>
    </PinGate>
  );
}
