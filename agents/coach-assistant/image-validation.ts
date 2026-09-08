import sharp from 'sharp';
import { COACH_IMAGE_LIMITS } from './contracts';
import type { CoachImageMime } from './contracts';

/** Existing Sharp dependency; full decode, orientation normalization and metadata removal. */
export async function normalizeCoachImage(bytes:Uint8Array,mime:CoachImageMime,signal:AbortSignal) {
  signal.throwIfAborted();
  if(!bytes.length||bytes.length>COACH_IMAGE_LIMITS.fileBytes)throw new Error('limit_exceeded');
  const data=Buffer.from(bytes);
  const signature=data[0]===0xff&&data[1]===0xd8&&data[2]===0xff?'image/jpeg':data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':data.subarray(0,4).toString()==='RIFF'&&data.subarray(8,12).toString()==='WEBP'?'image/webp':null;
  if(signature!==mime)throw new Error('invalid_image');
  const processor=sharp(data,{limitInputPixels:COACH_IMAGE_LIMITS.pixels,failOn:'warning',animated:false});
  const cancel=()=>processor.destroy();signal.addEventListener('abort',cancel,{once:true});
  try {
    const metadata=await processor.metadata();
    if(!metadata.width||!metadata.height||metadata.width*metadata.height>COACH_IMAGE_LIMITS.pixels||(metadata.pages??1)>1)throw new Error('invalid_image');
    signal.throwIfAborted();
    // Sharp strips EXIF/XMP/IPTC by default; rotate applies EXIF orientation first.
    const normalized=await processor.rotate().jpeg({quality:85}).toBuffer({resolveWithObject:true});
    signal.throwIfAborted();
    if(normalized.data.length>COACH_IMAGE_LIMITS.fileBytes)throw new Error('limit_exceeded');
    return {bytes:normalized.data,metadata:{mime:'image/jpeg' as const,bytes:normalized.data.length,width:normalized.info.width,height:normalized.info.height}};
  } finally {signal.removeEventListener('abort',cancel);processor.destroy();}
}
