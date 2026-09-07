'use client';
import type { AtlasManifest } from '@/lib/anatomy/types';
import { useI18n } from '@/lib/i18n';

/** Selection-scoped provenance: illustrated additions never inherit source review. */
export function StructureProvenance({ manifest, conceptId }: { manifest: AtlasManifest; conceptId: string }) {
  const { t } = useI18n();
  const authored = conceptId.startsWith('AUTHORED_') ? manifest.authored : undefined;
  const chunk = authored ? manifest.chunks.find(item => item.id === 'authored-core') : undefined;
  return <div className="anatomy-provenance">
    <p>{authored ? `${t('anatomy.authored_model')} · ${authored.author}` : `BodyParts3D · ${manifest.source.release}`}</p>
    <p>{authored ? t('anatomy.authored_review_pending') : t('anatomy.not_clinical')}</p>
    <p className="anatomy-hash">{conceptId} · {t('anatomy.version_identity')}: {authored ? chunk?.sha256 : manifest.release}</p>
    {authored ? <><p>{authored.license}</p><p className="anatomy-hash">{t('anatomy.recipe_identity')} SHA256: {authored.recipeSha256}</p></> : <p>{manifest.license.attribution} · <a href={manifest.license.url}>CC BY 4.0</a></p>}
  </div>;
}
