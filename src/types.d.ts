// Chromium-only File System Access API bits not yet in lib.dom.
interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite';
}
interface FileSystemHandle {
  queryPermission(desc?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  requestPermission(desc?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}
interface Window {
  showDirectoryPicker?(opts?: { id?: string; mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>;
}

declare module '*.css';
