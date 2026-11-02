import { useLayoutEffect, useRef, useState } from "react";
import type { EditorSchema } from "@/components/dojo/certificate-editor/types";
import { CertificateRenderer } from "./CertificateRenderer";

/**
 * Miniatura fiel de um certificado: desenha o modelo inteiro com o renderer
 * oficial e escala para a largura disponível (acompanha o redimensionamento).
 */
export function CertificateThumb({
  doc,
  values,
  width,
  className,
}: {
  doc: EditorSchema;
  values?: Record<string, string>;
  /** Largura fixa em px; sem ela, ocupa a largura do container. */
  width?: number;
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState<number>(width ?? 0);

  useLayoutEffect(() => {
    if (width) return;
    const node = boxRef.current;
    if (!node) return;
    const read = () => setW(node.clientWidth);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(node);
    return () => ro.disconnect();
  }, [width]);

  const scale = w > 0 ? w / doc.page.width : 0;
  return (
    <div
      ref={boxRef}
      className={className}
      style={{
        position: "relative",
        width: width ?? "100%",
        aspectRatio: `${doc.page.width} / ${doc.page.height}`,
        overflow: "hidden",
        background: doc.page.background || "#ffffff",
      }}
    >
      {scale > 0 && (
        <div style={{ position: "absolute", left: 0, top: 0, transform: `scale(${scale})`, transformOrigin: "top left", pointerEvents: "none" }}>
          <CertificateRenderer doc={doc} values={values} />
        </div>
      )}
    </div>
  );
}
