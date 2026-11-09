import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MODALITY_CATALOG, OTHER_MODALITY_LABEL, isCatalogModality, normalizeModality } from "@/lib/dojo/modalities";
import { saveSetupIdentity, type SetupState } from "@/lib/dojo/setup.functions";
import { maskPhone } from "@/lib/br-masks";
import { supabase } from "@/integrations/supabase/client";

export function StepIdentity({ academy, onNext, onBusy }: { academy: SetupState["academy"]; onNext: () => Promise<void>; onBusy: (value: boolean) => void }) {
  const save = useServerFn(saveSetupIdentity);
  // Modalidades do catálogo viram id ("judô" salvo antes vira "judo"); o que
  // não é do catálogo vai para "Outra", em texto livre.
  const saved = academy?.modalities ?? [];
  const [form, setForm] = useState({ trade_name: academy?.trade_name ?? "", whatsapp: academy?.whatsapp ?? "", city: academy?.city ?? "", state: academy?.state ?? "", modalities: Array.from(new Set(saved.filter(isCatalogModality).map(normalizeModality))) });
  const savedOther = saved.filter((m) => !isCatalogModality(m)).join(", ");
  const [otherOn, setOtherOn] = useState(savedOther.length > 0);
  const [otherText, setOtherText] = useState(savedOther);
  const otherList = otherOn ? otherText.split(",").map((m) => m.trim()).filter(Boolean) : [];
  const allModalities = [...form.modalities, ...otherList];
  const [busy, setBusy] = useState(false);
  const [logo, setLogo] = useState<File | null>(null);
  return <form className="space-y-5" onSubmit={async (event) => {
    event.preventDefault(); setBusy(true); onBusy(true);
    try {
      let logoUrl = academy?.logo_url ?? null;
      if (logo) {
        if (!["image/png", "image/jpeg", "image/webp"].includes(logo.type) || logo.size > 5 * 1024 * 1024) throw new Error("Use PNG, JPEG ou WebP de até 5 MB.");
        const { data, error } = await supabase.auth.getUser(); if (error || !data.user) throw new Error("Sessão expirada.");
        const path = `logo/${data.user.id}/${crypto.randomUUID()}.${logo.type.split("/")[1]}`;
        const uploaded = await supabase.storage.from("dojo-brand").upload(path, logo, { contentType: logo.type });
        if (uploaded.error) throw new Error(uploaded.error.message);
        logoUrl = supabase.storage.from("dojo-brand").getPublicUrl(path).data.publicUrl;
      }
      if (otherOn && otherList.length === 0) throw new Error("Digite o nome da outra modalidade.");
      await save({ data: { ...form, modalities: allModalities, logo_url: logoUrl } }); await onNext();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível salvar."); } finally { setBusy(false); onBusy(false); }
  }}>
    <div className="space-y-2"><Label htmlFor="setup-name">Nome do dojo</Label><Input id="setup-name" required minLength={2} maxLength={200} value={form.trade_name} onChange={(e) => setForm({ ...form, trade_name: e.target.value })} /></div>
    <div className="space-y-2"><Label htmlFor="setup-phone">WhatsApp</Label><Input id="setup-phone" type="tel" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: maskPhone(e.target.value) })} /></div>
    <div className="grid grid-cols-[1fr_80px] gap-3"><div className="space-y-2"><Label htmlFor="setup-city">Cidade</Label><Input id="setup-city" maxLength={120} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div><div className="space-y-2"><Label htmlFor="setup-state">UF</Label><Input id="setup-state" maxLength={2} pattern="[A-Za-z]{2}" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })} /></div></div>
    <fieldset>
      <legend className="mb-1 text-sm font-medium">Modalidades</legend>
      <p className="mb-3 text-xs text-muted-foreground">As faixas das modalidades com graduação já vêm prontas no sistema (Boxe e MMA não têm graduação).</p>
      <div className="grid grid-cols-2 gap-3">
        {MODALITY_CATALOG.map((m) => (
          <label key={m.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.modalities.includes(m.id)}
              onChange={(e) => setForm({ ...form, modalities: e.target.checked ? [...form.modalities, m.id] : form.modalities.filter((x) => x !== m.id) })}
            />
            {m.label}
          </label>
        ))}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={otherOn} onChange={(e) => setOtherOn(e.target.checked)} />
          {OTHER_MODALITY_LABEL}
        </label>
      </div>
      {otherOn && (
        <Input
          aria-label="Outra modalidade"
          className="mt-3"
          maxLength={120}
          placeholder="Ex.: Capoeira, Kung Fu (separe por vírgula)"
          value={otherText}
          onChange={(e) => setOtherText(e.target.value)}
        />
      )}
    </fieldset>
    <div className="space-y-2"><Label htmlFor="setup-logo">Logotipo (opcional)</Label><Input id="setup-logo" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setLogo(e.target.files?.[0] ?? null)} /></div>
    <Button type="submit" disabled={busy || allModalities.length === 0} className="w-full">{busy ? "Salvando…" : "Salvar e continuar"}</Button>
  </form>;
}