// Slot layout permettant l'interception de routes pour ouvrir un drawer
// au-dessus de /france/budget. Mirror de /ville/paris/daily-bread.
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
