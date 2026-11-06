import * as tls from 'tls';

/**
 * Add the OS certificate store to Node's trusted CAs: corporate TLS inspection
 * (e.g. Fortinet) re-signs HTTPS with a root the OS trusts but Node's bundled list
 * does not. Never throws (a throw at startup would count as a silent-update strike).
 */
export function trustSystemCa(tlsMod: typeof tls = tls): boolean {
  try {
    if (
      typeof tlsMod.getCACertificates !== 'function' ||
      typeof tlsMod.setDefaultCACertificates !== 'function'
    ) {
      return false;
    }
    tlsMod.setDefaultCACertificates([
      ...new Set([...tlsMod.getCACertificates('default'), ...tlsMod.getCACertificates('system')]),
    ]);
    return true;
  } catch (err) {
    console.log(
      `[Pixel Office] 시스템 인증서를 불러오지 못했습니다: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}
