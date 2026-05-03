import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Admission RAG Chatbot",
  description: "Tra cứu và tư vấn tuyển sinh dựa trên dữ liệu đã crawl"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
