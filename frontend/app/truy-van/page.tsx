"use client";

import { useEffect, useMemo, useState } from "react";
import { Shell } from "@/components/Shell";
import { StatusBadge } from "@/components/StatusBadge";

type SchoolItem = {
  code: string;
  name: string;
  shortName: string;
  province: string;
  programCount: number;
};

type SchoolDetail = {
  "ma-truong": string;
  "ten-truong": string;
  "ten-viet-tat": string;
  "dia-chi-tinh": string;
  "dia-chi-cu-the": string;
  "de-an-tuyen-sinh": string;
  "hoc-phi": string;
  "gioi-thieu": string;
};

type CutoffRow = {
  "ma-truong": string;
  "ma-nganh": string;
  "ten-nganh": string;
  "to-hop": string;
  "diem-chuan": number;
  "ghi-chu": string;
};

export default function SearchPage() {
  const [schools, setSchools] = useState<SchoolItem[]>([]);
  const [selectedCode, setSelectedCode] = useState<string>("");
  const [keyword, setKeyword] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(30);
  const [loadingSchools, setLoadingSchools] = useState<boolean>(false);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [detail, setDetail] = useState<{
    school: SchoolDetail;
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
    cutoffs: CutoffRow[];
  } | null>(null);

  const selectedSchool = useMemo(
    () => schools.find((s) => s.code === selectedCode) || null,
    [schools, selectedCode]
  );

  useEffect(() => {
    let ignore = false;
    async function loadSchools() {
      setLoadingSchools(true);
      setError("");
      try {
        const res = await fetch("/api/catalog/schools", { cache: "no-store" });
        if (!res.ok) {
          throw new Error(`Không tải được danh sách trường: ${res.status}`);
        }
        const data = (await res.json()) as { schools: SchoolItem[] };
        if (ignore) {
          return;
        }
        setSchools(data.schools);
        if (!selectedCode && data.schools.length > 0) {
          setSelectedCode(data.schools[0].code);
        }
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : "Lỗi tải dữ liệu trường");
        }
      } finally {
        if (!ignore) {
          setLoadingSchools(false);
        }
      }
    }
    loadSchools();
    return () => {
      ignore = true;
    };
  }, [selectedCode]);

  useEffect(() => {
    let ignore = false;
    async function loadDetail() {
      if (!selectedCode) {
        return;
      }
      setLoadingDetail(true);
      setError("");
      try {
        const params = new URLSearchParams({
          code: selectedCode,
          keyword: keyword.trim(),
          page: String(page),
          pageSize: String(pageSize)
        });
        const res = await fetch(`/api/catalog/school?${params.toString()}`, { cache: "no-store" });
        if (!res.ok) {
          throw new Error(`Không tải được thông tin trường: ${res.status}`);
        }
        const data = (await res.json()) as {
          school: SchoolDetail;
          pagination: { page: number; pageSize: number; total: number; totalPages: number };
          cutoffs: CutoffRow[];
        };
        if (!ignore) {
          setDetail(data);
        }
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : "Lỗi tải chi tiết trường");
        }
      } finally {
        if (!ignore) {
          setLoadingDetail(false);
        }
      }
    }
    loadDetail();
    return () => {
      ignore = true;
    };
  }, [selectedCode, keyword, page, pageSize]);

  return (
    <Shell>
      <section className="rounded-2xl border border-slate-200 bg-white/85 p-4 sm:p-5">
        <h1 className="font-heading text-2xl font-semibold text-slate-900">Trang truy vấn thông tin trường</h1>
        <p className="mt-1 text-sm text-slate-600">
          Chọn một trường để xem nhanh thông tin tổng quan, học phí và bảng điểm chuẩn theo ngành.
        </p>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-12">
        <aside className="rounded-2xl border border-slate-200 bg-white/85 p-4 lg:col-span-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-heading text-lg font-semibold text-slate-900">Danh sách trường</h2>
            <StatusBadge ok={!loadingSchools} label={loadingSchools ? "Đang tải" : `${schools.length} trường`} />
          </div>

          <div className="max-h-[65vh] space-y-2 overflow-y-auto">
            {schools.map((s) => (
              <button
                key={s.code}
                type="button"
                onClick={() => {
                  setSelectedCode(s.code);
                  setPage(1);
                }}
                className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                  selectedCode === s.code
                    ? "border-teal-300 bg-teal-50"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <p className="text-sm font-semibold text-slate-900">{s.name}</p>
                <p className="mt-0.5 text-xs text-slate-600">
                  {s.shortName} - {s.province}
                </p>
                <p className="mt-1 text-xs text-slate-500">{s.programCount} ngành có điểm chuẩn</p>
              </button>
            ))}
          </div>
        </aside>

        <div className="space-y-4 lg:col-span-8">
          <article className="rounded-2xl border border-slate-200 bg-white/85 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-heading text-lg font-semibold text-slate-900">Thông tin trường</h2>
              {selectedSchool ? (
                <StatusBadge ok={true} label={selectedSchool.shortName} />
              ) : null}
            </div>
            {detail?.school ? (
              <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Tên trường</p>
                  <p className="mt-1 font-medium text-slate-900">{detail.school["ten-truong"]}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Địa chỉ</p>
                  <p className="mt-1 text-slate-900">{detail.school["dia-chi-cu-the"]}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Mã trường</p>
                  <p className="mt-1 font-mono text-slate-900">{detail.school["ma-truong"]}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Học phí</p>
                  <p className="mt-1 whitespace-pre-wrap text-slate-900">{detail.school["hoc-phi"]}</p>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-500">{loadingDetail ? "Đang tải chi tiết trường..." : "Chưa có dữ liệu"}</p>
            )}
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white/85 p-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tìm ngành / mã ngành / tổ hợp</span>
                <input
                  value={keyword}
                  onChange={(e) => {
                    setKeyword(e.target.value);
                    setPage(1);
                  }}
                  className="w-72 max-w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-teal-600 focus:ring"
                />
              </label>
              <p className="text-xs text-slate-500">
                Mẹo: thử nhập "công nghệ thông tin", "A01" hoặc mã ngành để lọc nhanh.
              </p>
              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Số dòng mỗi trang</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value={20}>20</option>
                  <option value={30}>30</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </label>
              {detail ? (
                <StatusBadge
                  ok={!loadingDetail}
                  label={`${detail.pagination.total} dòng - trang ${detail.pagination.page}/${detail.pagination.totalPages}`}
                />
              ) : null}
            </div>

            {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}

            <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full border-collapse text-sm">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold">Mã ngành</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold">Tên ngành</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold">Tổ hợp</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold">Điểm chuẩn</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold">Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {detail?.cutoffs?.map((row, idx) => (
                    <tr key={`${row["ma-nganh"]}-${idx}`} className="odd:bg-white even:bg-slate-50/60">
                      <td className="border-b border-slate-100 px-3 py-2 font-mono text-xs">{row["ma-nganh"]}</td>
                      <td className="border-b border-slate-100 px-3 py-2">{row["ten-nganh"]}</td>
                      <td className="border-b border-slate-100 px-3 py-2">{row["to-hop"]}</td>
                      <td className="border-b border-slate-100 px-3 py-2 font-semibold text-slate-900">{row["diem-chuan"]}</td>
                      <td className="border-b border-slate-100 px-3 py-2">{row["ghi-chu"] || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={!detail || detail.pagination.page <= 1 || loadingDetail}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Trước
              </button>
              <button
                type="button"
                onClick={() =>
                  setPage((p) =>
                    !detail ? p : Math.min(detail.pagination.totalPages, p + 1)
                  )
                }
                disabled={!detail || detail.pagination.page >= detail.pagination.totalPages || loadingDetail}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Sau
              </button>
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white/85 p-4">
            <h3 className="font-heading text-base font-semibold text-slate-900">Thông tin mở rộng</h3>
            {detail?.school ? (
              <details className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <summary className="cursor-pointer text-sm font-medium text-slate-800">Xem đề án tuyển sinh và giới thiệu</summary>
                <div className="mt-3 grid gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Đề án tuyển sinh</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{detail.school["de-an-tuyen-sinh"]}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Giới thiệu</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{detail.school["gioi-thieu"]}</p>
                  </div>
                </div>
              </details>
            ) : null}
            <p className="mt-2 text-sm text-slate-600">
              Nếu cần đối chiếu thêm, bạn có thể dùng trang Chatbot để hỏi sâu theo từng phương thức xét tuyển.
            </p>
          </article>
        </div>
      </section>
    </Shell>
  );
}
