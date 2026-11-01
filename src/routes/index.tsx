import { createFileRoute, redirect } from "@tanstack/react-router";

// O app inteiro é o Dojo Manager: a raiz do domínio leva à landing do produto.
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/dojo" });
  },
});
