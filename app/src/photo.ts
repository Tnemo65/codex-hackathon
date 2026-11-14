// Pick or take a photo, then shrink it before upload: phone photos are several MB.
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export interface Photo {
  uri: string; // local, resized
  base64: string; // JPEG, no "data:" prefix
}

const MAX_WIDTH = 1024;

async function shrink(uri: string): Promise<Photo> {
  const image = await ImageManipulator.manipulate(uri, { maxWidth: MAX_WIDTH * 2 })
    .resize({ width: MAX_WIDTH, height: null })
    .renderAsync();
  const saved = await image.saveAsync({ base64: true, compress: 0.7, format: SaveFormat.JPEG });
  return { uri: saved.uri, base64: saved.base64 ?? '' };
}

// Returns null when the user cancels. Throws a Vietnamese message when permission is denied.
export async function takePhoto(): Promise<Photo | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('Chưa có quyền camera. Bạn có thể chọn ảnh từ thư viện.');
  const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
  if (res.canceled || !res.assets?.[0]) return null;
  return shrink(res.assets[0].uri);
}

export async function pickPhoto(): Promise<Photo | null> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
  if (res.canceled || !res.assets?.[0]) return null;
  return shrink(res.assets[0].uri);
}
