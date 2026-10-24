// يُخدَم ملف اللغة العربية بامتداد مسموح، فنعيد توجيه طلبه هنا قبل تحميل العامل الأصلي.
const nativeFetch = self.fetch.bind(self);
self.fetch = (url, opts) => nativeFetch(String(url).replace(/ara\.traineddata\.gz$/, 'ara-traineddata.wasm'), opts);
importScripts('worker.min.js');
