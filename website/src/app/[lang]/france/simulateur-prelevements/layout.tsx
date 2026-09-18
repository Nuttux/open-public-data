// Slot layout permettant l'interception de routes pour ouvrir un drawer
// au-dessus de /daily-bread (pattern aligné sur /qui-recoit).
export default function DailyBreadLayout({
  children,
  drawer,
}: {
  children: React.ReactNode;
  drawer: React.ReactNode;
}) {
  return (
    <>
      {children}
      {drawer}
    </>
  );
}
