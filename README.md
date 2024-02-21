# awesome-storage-manage：前端存储管理方案

## 一、项目当前痛点

### 1.   存/取storage方法各式各样

-   有直接调用原生setItem/getItem的
-   也有自己封装了一套方法的
-   还有使用工具sdk方法的

需要统一存取的方法，减少后续维护成本

```
import AwesomeStorage from 'awesome-storage-manage';

// 白名单
const whitelist = [
  'SLARDARnovel_author_i18n',
  '__tea_cache_tokens_4793',
  'mue_first_load_novel_author_i18n_cdn',
];

// 白名单正则
const whitelistRegExps = [
  /happy_debug/,
  /text./,
  /version./,
  /pia_/,
  /mue_first_load/,
  /SLARDAR/,
  /tea_cache/,
];

const myLocalStorage =  new AwesomeStorage(whitelist, whitelistRegExps);

// 存
myLocalStorage.setItem('xxxx-key-xxxxx', value, {schedule: 1})；

// 取
myLocalStorage.getItem('xxxx-key-xxxxx')；
```




 ### 2.存储storage格式不规范

需要定义 Storage 存储结构，在存储值的基础上，增加额外字段，用于支持自定义的管理能力。

```
 /**
* 存储项结构，默认对外暴露具体「格式化的值」，使用者不需关心具体设置
*/
interface AwesomeStorageItem {
  /** 存储的值，传入和传出的都是格式化的值 */
  value: any;
  /** 具体过期时间，unix时间戳 */
  expire?: number;
  /** 续期制周期，旧数据默认周期是 s，存在周期一定存在具体过期时间 */
  schedule?: AwesomeStorageSchedule;
  /** 是否只使用1次，一旦有取值操作，该项立即销毁 */
  once?: boolean;
}
```




### 3.  历史数据需要转化处理

之前的历史storage存储格式需要转化成规范的形式。

首次运行时，做历史数据转换，后续不再重复处理。





### 4.   无storage清除/续期机制

历史存入的storage有些长期用不到，日积月累后，占据了用户设备大量的存储空间。

需要添加项目定期清除storage机制，以及经常访问的storage续期增加存储时间的机制。

-   清除机制

-   续期机制





## 二、使用方法

### 1.   初始化

-   可传入白名单列表，包含此这些string的storage不会被自动转换，针对一些sdk内置storage存储的情况：whitelist?: string[];
-   可传入白名单正则列表，匹配这些正则的storage不会被自动转换，针对一些sdk内置storage存储的情况：
whitelistRegExps?: RegExp[];

-   可传入项目启动时清除过期storage的周期，默认为10天 ：cleanCycle: number;
-   可传入构造函数localStorage or sessionStorage, 默认是 localStorage

```
import AwesomeStorage from 'awesome-storage-manage';

// 白名单
const whitelist = [
  'SLARDARnovel_author_i18n',
  '__tea_cache_tokens_4793',
  'mue_first_load_novel_author_i18n_cdn',
];

// 白名单正则
const whitelistRegExps = [
  /happy_debug/,
  /text./,
  /version./,
  /pia_/,
  /mue_first_load/,
  /SLARDAR/,
  /tea_cache/,
];

const myLocalStorage =  new AwesomeStorage(whitelist, whitelistRegExps，20);
```




### 2.   清除/历史storage转化机制

```
 // 转化历史不规范的storage & storage过期清除
myLocalStorage.init();

// 具体方法
/** 应用冷启动时初始化项目本地存储 */
init() {
  // 执行一次清理
  if (
    this.originTarget.getItem(cleanCycleKey) &&
    Number(this.originTarget.getItem(cleanCycleKey)) +
      this.cleanCycle * 24 * 3600 >=
      Math.floor(new Date().getTime() / 1000)
  ) {
    this.clean();
  }
  if (this.originTarget.getItem(convertedKey)) {
    this.hasConvert = true;
    return;
  }
  // 如果未格式化则启动预处理
  this.normalize();
}



/** [私有方法] 清理本地存储中过期的项，通常在冷启动是异步处理 */
private clean() {
  this.setItem(cleanCycleKey, Math.floor(new Date().getTime() / 1000));
  const list = this.getNormalizedItems();
  list.forEach(([key, item]) => {
    const normalized = this.parse(item);
    if (!(normalized && this.checkExpire(normalized))) {
      this.removeItem(key);
    }
  });
}

/** [私有方法] 标准化本地存储 */
private normalize() {
  const savedList = this.getNormalizedItems();
  savedList.forEach(([key, value]) =>
    this.setItem(key, value, { schedule: AwesomeStorageSchedule.small }),
  );
  // 存转化标识key
  this.setItem(convertedKey, true);
  // 存cleanCycle时间戳
  this.setItem(cleanCycleKey, Math.floor(new Date().getTime() / 1000));
  this.hasConvert = true;
}

/** [私有方法] 获取已格式化的值列表 */
private getNormalizedItems(): [string, string][] {
  return Object.entries(this.originTarget).filter(
    ([key]) =>
      !this?.whitelist?.includes(key) &&
      !this?.whitelistRegExps?.some(reg => reg.test(key)),
  );
}
```

### 3.   续期机制

```
 /** 读取 key 对应的值，读出的值已经过序列化 */
getItem(key: string, defaultValue?: any) {
  const data = this.originTarget.getItem(key);
  const normalized = this.parse(data);
  // 仅用一次的值，用完销毁
  if (normalized?.once) {
    this.removeItem(key);
  }
  // 续期再存
  if (normalized?.schedule) {
    const currentDate = new Date();
    currentDate.setMonth(currentDate.getMonth() + normalized.schedule);
    const unixTimestamp = Math.floor(currentDate.getTime() / 1000);
    this.save(key, {
      ...normalized,
      expire: unixTimestamp,
    });
  }
  return normalized?.value ?? defaultValue;
}
```
## 三、API

```javascript
import AwesomeStorage from 'awesome-storage-manage';

// 白名单
const whitelist = [
  'SLARDARnovel_author_i18n',
  '__tea_cache_tokens_4793',
  'mue_first_load_novel_author_i18n_cdn',
];

// 白名单正则
const whitelistRegExps = [
  /happy_debug/,
  /text\./,
  /version\./,
  /pia_/,
  /mue_first_load/,
  /SLARDAR/,
  /tea_cache/,
];

const myLocalStorage =  new AwesomeStorage(whitelist, whitelistRegExps);

// 初始化（转化历史不规范的storage & storage过期清除）
myLocalStorage.init();

// 存
myLocalStorage.setItem('xxxx-key-xxxxx', value, {schedule: 1})；

// 取
myLocalStorage.getItem('xxxx-key-xxxxx')；

// 存一次就清除
myLocalStorage.setItemOnce('xxxx-key-xxxxx', value)；

// 清除
myLocalStorage.removeItem('xxxx-key-xxxxx')；

// 全部清除
myLocalStorage.clear();

```
