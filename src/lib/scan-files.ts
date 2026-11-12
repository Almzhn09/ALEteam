import type {ArchiveFile} from '@/contracts/api';
export function originalFiles(files:ArchiveFile[]){return files.filter(file=>file.variant!=='preview');}
export function fittedScan(master:ArchiveFile,files:ArchiveFile[],zoom:number){
 return zoom===0?files.find(file=>file.variant==='preview'&&file.parentFileId===master.id&&['image/png','image/jpeg'].includes(file.mimeType))??master:master;
}
