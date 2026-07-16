// Slot layout permettant l'interception de routes pour ouvrir un drawer
// au-dessus de /fr/national/budget. Mirror de /fr/national/daily-bread.
export default function FranceBudgetLayout({
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
