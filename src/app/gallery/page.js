import { redirect } from "next/navigation";

/* The gallery was a second place showing the same account's work, outside
   the studio and without any of its controls — no way to clear a failure,
   no way to stop a run. It is the Assets studio's "Runs" view now, which
   has both. The route stays so every bookmark and link still lands
   somewhere true. */
export const metadata = { title: "Your work", robots: { index: false, follow: false } };

export default function GalleryPage() {
  redirect("/studio/assets");
}
