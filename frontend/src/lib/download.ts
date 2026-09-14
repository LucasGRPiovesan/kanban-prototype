/**
 * Downloads a file without navigating the tab.
 *
 * The plain approach — an `<a download>` pointing straight at the file's URL — is
 * unreliable across origins: browsers honour `download` only for same-origin links (or
 * a response carrying `Content-Disposition: attachment`, which the storage endpoint does
 * not send), and the API and the SPA are deliberately two origins here. Without this, a
 * click on "Baixar" would silently fall back to navigating the tab to the raw file —
 * exactly the behaviour this feature exists to remove.
 *
 * Fetching the bytes and handing the browser a same-origin `blob:` URL sidesteps that:
 * `download` always works on a blob URL, regardless of where the bytes came from.
 */
export async function downloadFile(url: string, filename: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    // A storage host that does not answer CORS for this origin makes `fetch` throw before
    // any HTTP status exists. Opening the file in a new tab still gets it to the person.
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  if (!response.ok) {
    throw new Error(`Falha ao baixar o arquivo (HTTP ${response.status}).`);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
