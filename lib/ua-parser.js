function parseUA(ua) {
  if (!ua) return { browser: 'Unknown', os: 'Unknown', device: 'Desktop' };

  // Device
  let device = 'Desktop';
  if (/Mobile|Android.*Mobile|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    device = 'Mobile';
  } else if (/iPad|Android(?!.*Mobile)|Tablet/i.test(ua)) {
    device = 'Tablet';
  }

  // Browser (order matters)
  let browser = 'Unknown';
  if (/Edg\//i.test(ua))                                       browser = 'Edge';
  else if (/OPR\//i.test(ua))                                  browser = 'Opera';
  else if (/Chrome\/\d/i.test(ua) && !/Chromium/i.test(ua))   browser = 'Chrome';
  else if (/Firefox\/\d/i.test(ua))                            browser = 'Firefox';
  else if (/Safari\/\d/i.test(ua) && !/Chrome/i.test(ua))     browser = 'Safari';
  else if (/Chromium/i.test(ua))                               browser = 'Chromium';
  else if (/MSIE|Trident/i.test(ua))                           browser = 'IE';

  // OS
  let os = 'Unknown';
  if (/Windows/i.test(ua))            os = 'Windows';
  else if (/CrOS/i.test(ua))          os = 'Chrome OS';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Android/i.test(ua))       os = 'Android';
  else if (/Mac OS X/i.test(ua))      os = 'macOS';
  else if (/Linux/i.test(ua))         os = 'Linux';

  return { browser, os, device };
}

module.exports = { parseUA };
