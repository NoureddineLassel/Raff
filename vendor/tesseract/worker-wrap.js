// تُخدَم ملفات اللغة بامتداد مسموح، فنعيد توجيه طلبها هنا قبل تحميل العامل الأصلي.
const nativeFetch = self.fetch.bind(self);
self.fetch = (url, opts) => nativeFetch(String(url).replace(/(ara|eng)\.traineddata\.gz$/, '$1-traineddata.wasm'), opts);
importScripts('worker.min.js');
