import * as XLSX from "xlsx";

// Colunas suportadas pelo importador. A ordem define a coluna no modelo.
export const STUDENT_IMPORT_COLUMNS: Array<{ key: string; label: string; hint?: string }> = [
  { key: "full_name", label: "Nome completo *" },
  { key: "cpf", label: "CPF" },
  { key: "rg", label: "RG" },
  { key: "birth_date", label: "Nascimento (AAAA-MM-DD)" },
  { key: "gender", label: "Sexo" },
  { key: "email", label: "E-mail" },
  { key: "phone", label: "Telefone" },
  { key: "zip", label: "CEP" },
  { key: "street", label: "Rua" },
  { key: "address_number", label: "Número" },
  { key: "neighborhood", label: "Bairro" },
  { key: "city", label: "Cidade" },
  { key: "state", label: "UF" },
  { key: "guardian_name", label: "Responsável" },
  { key: "guardian_phone", label: "Tel. responsável" },
  { key: "emergency_contact_name", label: "Contato emergência" },
  { key: "emergency_contact_phone", label: "Tel. emergência" },
  { key: "emergency_contact_relationship", label: "Parentesco" },
  { key: "blood_type", label: "Tipo sanguíneo" },
  { key: "profession", label: "Profissão" },
  { key: "notes", label: "Observações" },
  { key: "status", label: "Status (ativo/inativo/congelado)" },
];

const LABEL_TO_KEY: Record<string, string> = Object.fromEntries(
  STUDENT_IMPORT_COLUMNS.map((c) => [normalize(c.label), c.key]),
);
// Também aceita chaves cruas como cabeçalho (ex.: "full_name")
for (const c of STUDENT_IMPORT_COLUMNS) LABEL_TO_KEY[normalize(c.key)] = c.key;

// Status aceitos no modelo, em português e inglês
const STATUS_TO_VALUE: Record<string, "active" | "inactive" | "frozen"> = {
  ativo: "active", inativo: "inactive", congelado: "frozen", trancado: "frozen",
  active: "active", inactive: "inactive", frozen: "frozen",
};

function normalize(s: string) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Linha de exemplo dos dois modelos (CSV e XLSX)
export const STUDENT_IMPORT_EXAMPLE: string[] = [
  "João da Silva",
  "000.000.000-00",
  "",
  "1990-05-12",
  "M",
  "joao@example.com",
  "(11) 90000-0000",
  "01310-100",
  "Av. Paulista",
  "1000",
  "Bela Vista",
  "São Paulo",
  "SP",
  "",
  "",
  "Maria Silva",
  "(11) 90000-0001",
  "Mãe",
  "O+",
  "Engenheiro",
  "Aluno de teste — remova esta linha",
  "ativo",
];

export function downloadStudentsTemplate() {
  const headers = STUDENT_IMPORT_COLUMNS.map((c) => c.label);
  const example = STUDENT_IMPORT_EXAMPLE;
  const aoa = [headers, example];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = headers.map(() => ({ wch: 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Alunos");
  XLSX.writeFile(wb, "modelo-importacao-alunos.xlsx");
}

export type ParsedStudentRow = Record<string, string>;

// Implantação assistida (/dojo/app/implantacao): o modelo traz só os dados
// pessoais; plano, turmas, faixa, grau e vencimento são escolhidos na tela. As
// colunas abaixo continuam aceitas para quem já tem tudo numa planilha: o sistema
// tenta reconhecer os nomes e o que não reconhecer o dono escolhe na tela.
export const IMPLEMENTATION_EXTRA_COLUMNS: Array<{ key: string; label: string; aliases: string[] }> = [
  { key: "plan", label: "Plano", aliases: ["plano de mensalidade"] },
  { key: "classes", label: "Turmas (separe com ;)", aliases: ["turmas", "turma"] },
  { key: "modality", label: "Modalidade da faixa", aliases: ["modalidade"] },
  { key: "belt", label: "Faixa", aliases: ["faixa atual"] },
  { key: "degree", label: "Grau", aliases: ["graus"] },
  { key: "due_day", label: "Dia de vencimento", aliases: ["vencimento", "dia vencimento"] },
];

const IMPLEMENTATION_BIRTH_LABEL = "Nascimento (DD/MM/AAAA)";

const IMPLEMENTATION_LABEL_TO_KEY: Record<string, string> = { ...LABEL_TO_KEY };
for (const c of IMPLEMENTATION_EXTRA_COLUMNS) {
  for (const label of [c.label, c.key, ...c.aliases]) IMPLEMENTATION_LABEL_TO_KEY[normalize(label)] = c.key;
}
for (const label of [IMPLEMENTATION_BIRTH_LABEL, "Nascimento", "Data de nascimento"]) {
  IMPLEMENTATION_LABEL_TO_KEY[normalize(label)] = "birth_date";
}

const IMPLEMENTATION_HOW_TO: string[][] = [
  ["Como preencher a planilha da implantação"],
  [""],
  ["1. Use a aba Alunos: uma linha por aluno. Só o nome completo é obrigatório."],
  ["2. Apague a linha de exemplo (João da Silva) antes de enviar."],
  ["3. Nascimento no formato DD/MM/AAAA (ex.: 12/05/1990)."],
  ["4. Status: ativo, inativo ou congelado. Em branco = ativo."],
  ["5. Plano, turmas, faixa, grau e vencimento NÃO vão na planilha:"],
  ["   depois de enviar, você escolhe cada um em listas, na tela da implantação,"],
  ["   com os planos e turmas que cadastrou e as faixas de cada modalidade."],
  ["6. Pode usar Excel ou Google Planilhas. Salve como .xlsx ou .csv e envie na etapa Alunos."],
];

export function downloadImplementationStudentsTemplate() {
  const headers = STUDENT_IMPORT_COLUMNS.map((c) =>
    c.key === "birth_date" ? IMPLEMENTATION_BIRTH_LABEL : c.label,
  );
  const example = STUDENT_IMPORT_COLUMNS.map((c, i) =>
    c.key === "birth_date" ? "12/05/1990" : STUDENT_IMPORT_EXAMPLE[i] ?? "",
  );
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  ws["!cols"] = headers.map(() => ({ wch: 22 }));
  const help = XLSX.utils.aoa_to_sheet(IMPLEMENTATION_HOW_TO);
  help["!cols"] = [{ wch: 90 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Alunos");
  XLSX.utils.book_append_sheet(wb, help, "Como preencher");
  XLSX.writeFile(wb, "implantacao-alunos.xlsx");
}

/** Data de célula do Excel em AAAA-MM-DD (meio-dia evita o deslocamento de fuso das datas antigas). */
function isoFromCellDate(d: Date): string {
  const noon = new Date(d.getTime() + 12 * 3600_000);
  return `${noon.getFullYear()}-${String(noon.getMonth() + 1).padStart(2, "0")}-${String(noon.getDate()).padStart(2, "0")}`;
}

export async function parseStudentsFile(
  file: File,
  preserveCsvText = false,
  withImplementationColumns = false,
): Promise<ParsedStudentRow[]> {
  const labelToKey = withImplementationColumns ? IMPLEMENTATION_LABEL_TO_KEY : LABEL_TO_KEY;
  const buf = await file.arrayBuffer();
  const csv = preserveCsvText && file.name.toLowerCase().endsWith(".csv");
  const wb = csv
    ? XLSX.read(new TextDecoder("utf-8").decode(buf), { type: "string", raw: true })
    : XLSX.read(buf, { type: "array", raw: preserveCsvText, cellDates: true });
  const wsName = wb.SheetNames[0];
  if (!wsName) return [];
  const ws = wb.Sheets[wsName];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: false });
  // Nascimento digitado no Excel vira célula de data, e o texto formatado sai no
  // padrão americano (5/12/90): lê o valor da data e grava AAAA-MM-DD.
  const values = csv ? [] : XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: true });
  const rows: ParsedStudentRow[] = [];
  for (const [index, r] of raw.entries()) {
    const mapped: ParsedStudentRow = {};
    for (const [k, v] of Object.entries(r)) {
      const key = labelToKey[normalize(k)];
      if (!key) continue;
      const cell = values[index]?.[k];
      const val = key === "birth_date" && cell instanceof Date && !Number.isNaN(cell.getTime())
        ? isoFromCellDate(cell)
        : String(v ?? "").trim();
      if (!val) continue;
      if (key === "status") {
        const mappedStatus = STATUS_TO_VALUE[normalize(val)];
        if (mappedStatus) mapped[key] = mappedStatus;
        continue;
      }
      mapped[key] = val;
    }
    if (mapped.full_name) rows.push(mapped);
  }
  return rows;
}
