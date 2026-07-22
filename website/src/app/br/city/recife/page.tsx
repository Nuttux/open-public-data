import { redirect } from "next/navigation";

/** Recife hub — no standalone hub page yet; enter through the budget view. */
export default function RecifeHubPage() {
  redirect("/br/city/recife/budget");
}
