export default function MobileShell({ children }) {
  return (
    <div className="h-dvh w-screen overflow-hidden bg-[#ECECE7] flex justify-center sm:py-4">
      <div
        id="phone-viewport"
        className="w-full max-w-[430px] h-full bg-white relative flex flex-col overflow-hidden sm:rounded-[24px] sm:border sm:border-neutral-200/90 sm:shadow-[0_12px_40px_rgba(0,0,0,0.08)]"
      >
        {children}
      </div>
    </div>
  );
}
