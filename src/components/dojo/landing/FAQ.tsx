import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Section } from "./Section";
import { CTABand } from "./CTABand";
import { LANDING_FAQS as faqs } from "@/lib/dojo/landing-faq";

export function FAQ() {
  return (
    <Section
      id="faq"
      eyebrow="FAQ"
      title="Perguntas frequentes."
      description="Não encontrou sua resposta? Fale com nosso time comercial."
      className="bg-neutral-50"
    >
      <div className="mx-auto max-w-3xl">
        <Accordion type="single" collapsible className="space-y-3">
          {faqs.map((f, i) => (
            <AccordionItem key={i} value={`item-${i}`} className="overflow-hidden rounded-xl border border-black/5 bg-white px-5">
              <AccordionTrigger className="text-left text-base font-semibold text-[#111111] hover:no-underline">
                {f.q}
              </AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed text-[#111111]/65">
                {f.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>

      <CTABand title="Ainda com dúvida? Teste 14 dias sem pagar nada." />
    </Section>
  );
}
