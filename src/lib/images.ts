/** Fotografija iz kamere/galerije -> mala JPEG data: adresa (ostaje u uređaju i ugrađuje se u knjižicu). */
const MAX_SIDE = 1000;
const QUALITY = 0.74;

const fileToDataUrl = (f: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('read failed'));
    r.readAsDataURL(f);
  });

export async function photoToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error(`"${file.name}" is not a picture`);
  // createImageBitmap poštuje okretanje iz EXIF-a (mobitel u uspravnom položaju), pa slika ne završi na boku.
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * scale));
    c.height = Math.max(1, Math.round(bmp.height * scale));
    c.getContext('2d')?.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close?.();
    return c.toDataURL('image/jpeg', QUALITY);
  } catch {
    // starije preglednike: obična slika (bez ispravka okretanja, ali s istim smanjenjem)
    const url = await fileToDataUrl(file);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onerror = () => reject(new Error(`"${file.name}" could not be read`));
      img.onload = () => {
        const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * scale));
        c.height = Math.max(1, Math.round(img.height * scale));
        c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', QUALITY));
      };
      img.src = url;
    });
  }
}
