import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Bike Ilha Club",
  description: "Aluguel de bicicletas em São Luís (MA)",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
