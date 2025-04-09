// clamav.js
import NodeClam from 'clamscan'

export const initClamAV = async () => {
  const clamscan = await new NodeClam().init({
    removeInfected: false,
    quarantineInfected: false,
    debugMode: false,
    clamdscan: {
      host: "127.0.0.1",
      port: 3310,
      timeout: 60000,
    },
  });
  return clamscan;
};
