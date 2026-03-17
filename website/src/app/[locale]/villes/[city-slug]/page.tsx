import { redirect } from 'next/navigation';

export default async function CityPage({
  params,
}: {
  params: Promise<{ locale: string; 'city-slug': string }>;
}) {
  const { locale, 'city-slug': slug } = await params;
  redirect(`/${locale}/villes/${slug}/budget`);
}
