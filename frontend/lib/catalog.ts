import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";

export type School = {
  "ma-truong": string;
  "ten-truong": string;
  "ten-viet-tat": string;
  "dia-chi-tinh": string;
  "dia-chi-cu-the": string;
  "de-an-tuyen-sinh": string;
  "hoc-phi": string;
  "gioi-thieu": string;
};

export type Cutoff = {
  "ma-truong": string;
  "ma-nganh": string;
  "ten-nganh": string;
  "to-hop": string;
  "diem-chuan": number;
  "ghi-chu": string;
};

type CatalogCache = {
  schools: School[];
  cutoffs: Cutoff[];
};

let cache: CatalogCache | null = null;

async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

export async function loadCatalog(): Promise<CatalogCache> {
  if (cache) {
    return cache;
  }

  const dataDir = path.resolve(process.cwd(), "data");
  const schoolsPath = path.join(dataDir, "truong.json");
  const cutoffsPath = path.join(dataDir, "diem_chuan_THPT.json");

  const [schools, cutoffs] = await Promise.all([
    readJsonFile<School[]>(schoolsPath),
    readJsonFile<Cutoff[]>(cutoffsPath)
  ]);

  cache = { schools, cutoffs };
  return cache;
}
