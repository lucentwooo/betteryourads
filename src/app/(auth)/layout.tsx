export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-paper text-ink">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
        <a href="/" className="mb-10 inline-flex w-fit items-baseline gap-[2px] font-serif text-[1.35rem] leading-none">
          <span className="italic">better</span>
          <span className="text-coral italic">your</span>
          <span className="italic">ads</span>
          <span className="ml-1 inline-block h-1.5 w-1.5 translate-y-[-2px] rounded-full bg-coral" />
        </a>
        {children}
      </div>
    </main>
  );
}
