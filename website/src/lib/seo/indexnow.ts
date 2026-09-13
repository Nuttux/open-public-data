/**
 * IndexNow — one POST tells Bing (and through it ChatGPT search and Copilot),
 * Yandex, Seznam and Naver that URLs are new or changed, up to 10 000 at a
 * time. Google does not take part: for Google the sitemaps stay the channel
 * (pipeline/scripts/seo/submit_sitemaps.py).
 *
 * The key is public by design: the engine proves we own a host by fetching
 * `/{key}.txt` from it, served from website/public/. Submitting is
 * pipeline/scripts/seo/indexnow_submit.py.
 */
export const INDEXNOW_KEY = 'd961b173e15596fe92091d1fc7f2d517';
