export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full flex-1 flex-col items-center justify-center gap-6 px-4 py-10">
      {children}
    </main>
  );
}
