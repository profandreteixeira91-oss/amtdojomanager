import { createFileRoute } from "@tanstack/react-router";
import { DojoPushCard } from "@/components/dojo/DojoPushCard";
import { InstallAppCard } from "@/components/dojo/InstallAppCard";
import { DojoPageHero } from "@/components/dojo/DojoPageHero";
import { BellRing } from "lucide-react";

export const Route = createFileRoute("/dojo/app/notifications")({
  head: () => ({
    meta: [
      { title: "Notificações — AMT Dojo Manager" },
      {
        name: "description",
        content:
          "Configure a instalação do Dojo Manager como aplicativo e escolha quais notificações push você quer receber em cada dispositivo.",
      },
    ],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <DojoPageHero
        icon={BellRing}
        eyebrow="Ajuda"
        title="Aplicativo & Notificações"
        description="Instale o Dojo Manager como app no celular ou desktop e ligue os alertas que fazem sentido para o seu dia a dia."
      />
      <InstallAppCard />
      <DojoPushCard />
    </div>
  );
}
