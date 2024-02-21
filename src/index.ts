/** 已转换的标识 */
const convertedKey = 'awesome_storage_converted';
/** 定期清除机制存的时间戳 */
const cleanCycleKey = 'awesome_storage_clean_cycle';

// 白名单
// const whitelist = [
//   convertedKey,
//   'SLARDARnovel_author_i18n',
//   '__tea_cache_tokens_4793',
//   'mue_first_load_novel_author_i18n_cdn',
// ];
// 白名单正则
// const whitelistRegExps = [/happy_debug/, /text\./, /version\./];
// const whitelistRegExps = [/happy_debug/, /text\./, /version\./, /pia_/, /mue_first_load/, /SLARDAR/, /tea_cache/];

function getUnitInMilliseconds(unit: string) {
  switch (unit) {
    case 'year':
      return 365 * 24 * 60 * 60 * 1000;
    case 'month':
      return 30 * 24 * 60 * 60 * 1000;
    case 'week':
      return 7 * 24 * 60 * 60 * 1000;
    case 'day':
      return 24 * 60 * 60 * 1000;
    case 'hour':
      return 60 * 60 * 1000;
    case 'minute':
      return 60 * 1000;
    case 'second':
      return 1000;
    default:
      throw new Error('Invalid unit');
  }
}

/**
 * 续期制周期，可选
 * 旧数据统一使用续期制，且默认短周期；新的使用中可选使用
 */
export enum AwesomeStorageSchedule {
  /** 短周期 1月 */
  small = 1,
  /** 中周期 2月 */
  middle = 2,
  /** 长周期 6月 */
  large = 6,
}

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

/**
 * 调用 setItem 时，新增的参数类型，可选
 * 支持 绝对时间、相对时间、续期制
 */
interface SetAwesomeStorageOption {
  absolute?: number;
  relative?: string; // 15day
  schedule?: AwesomeStorageSchedule;
}

/**
 * 实例类型，支持的属性和方法
 */
interface AwesomeStorageProps {
  /** [新增数据]转换标识，项目中使用的 Key 都经过格式化转换，针对改造前的旧数据 */
  hasConvert: boolean;

  /** [新增数据]原构造函数，localStorage or sessionStorage, 默认是 localStorage */
  originTarget: Storage;

  /** [原方法拓展]读取 key 对应的值，读出的值已经过序列化 */
  getItem: (key: string, defaultValue?: any) => any | null;

  /** [原方法拓展]设置 key 及对应的值，以序列化的形式存储 */
  setItem: (key: string, value: any, options?: SetAwesomeStorageOption) => void;

  /** [新增方法]设置 key 及对应的值，该值一旦读取立即销毁 */
  setItemOnce: (key: string, value: any) => void;

  /** 移除 key 及对应的值 */
  removeItem: (key: string) => void;

  /** 清空全部存储项 */
  clear: () => void;

  /** [新增方法]应用冷启动时初始化项目本地存储 */
  init: () => void;
}

/** 项目自定义存储构造函数 */
export default class SerialStorage implements AwesomeStorageProps {
  /** 转换标识，项目中使用的 Key 都经过格式化转换，针对改造前的旧数据 */
  hasConvert: boolean;

  /** 原构造函数，localStorage or sessionStorage, 默认是 localStorage */
  originTarget: Storage;

  /** 白名单列表，包含此这些string的storage不会被自动转换，针对一些sdk内置storage存储的情况 */
  whitelist?: string[];

  /** 白名单正则列表，匹配此这些正则的storage不会被自动转换，针对一些sdk内置storage存储的情况 */
  whitelistRegExps?: RegExp[];

  /** 项目启动时清除过期storage的周期，默认为10天 */
  cleanCycle: number;

  constructor(
    whitelist?: string[],
    whitelistRegExps?: RegExp[],
    cleanCycle?: number,
    originTarget?: Storage,
  ) {
    this.hasConvert = false;
    this.originTarget = originTarget ?? localStorage;
    this.whitelist = whitelist
      ? [...whitelist, convertedKey, cleanCycleKey]
      : [convertedKey, cleanCycleKey];
    this.cleanCycle = cleanCycle || 10;
    this.whitelistRegExps = whitelistRegExps ?? [];
  }

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
        // expire: dayjs().add(normalized.schedule, 'month').unix(),
        expire: unixTimestamp,
      });
    }
    return normalized?.value ?? defaultValue;
  }

  /** 设置 key 及对应的值，以序列化的形式存储 */
  setItem(
    key: string,
    value: any,
    options?: {
      absolute?: number;
      relative?: string; // 15day
      schedule?: AwesomeStorageSchedule;
    },
  ) {
    const target: AwesomeStorageItem = {
      value,
    };

    const { absolute, relative, schedule } = options ?? {};

    if (absolute) {
      target.expire = absolute;
    } else if (relative) {
      const [, date, unit] = /(\d+)(\w+)/.exec(relative) ?? [];
      const currentDate = new Date();
      currentDate.setTime(
        currentDate.getTime() + Number(date) * getUnitInMilliseconds(unit),
      );
      const unixTimestamp = Math.floor(currentDate.getTime() / 1000);
      // target.expire = dayjs()
      //   .add(Number(date), unit as any)
      //   .unix();
      target.expire = unixTimestamp;
    }
    if (schedule) {
      const currentDate = new Date();
      currentDate.setMonth(currentDate.getMonth() + schedule);
      const unixTimestamp = Math.floor(currentDate.getTime() / 1000);
      // target.expire = target.expire ?? dayjs().add(schedule, 'month').unix();
      target.expire = target.expire ?? unixTimestamp;
      target.schedule = schedule;
    }

    this.save(key, target);
  }

  /** 设置 key 及对应的值，该值一旦读取立即销毁 */
  setItemOnce(key: string, value: any) {
    this.save(key, { value, once: true });
  }

  /** 移除 key 及对应的值 */
  removeItem(key: string) {
    this.originTarget.removeItem(key);
  }

  /** 清空全部存储项 */
  clear() {
    this.originTarget.clear();
  }

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

  /** [私有方法] 按照既定结构体的形式解析 */
  private parse(value: string | null) {
    let normalized: AwesomeStorageItem | null = null;
    try {
      if (value) {
        normalized = JSON.parse(value) as AwesomeStorageItem;
      }
    } catch (err) {
      normalized = null;
    }

    return normalized;
  }

  /** [私有方法] 存储 */
  private save(key: string, value: AwesomeStorageItem) {
    this.originTarget.setItem(key, JSON.stringify(value));
  }

  /** [私有方法] 获取已格式化的值列表 */
  private getNormalizedItems(): [string, string][] {
    return Object.entries(this.originTarget).filter(
      ([key]) =>
        !this?.whitelist?.includes(key) &&
        !this?.whitelistRegExps?.some(reg => reg.test(key)),
    );
  }

  /** [私有方法] 检查存储项是否过期 */
  private checkExpire(target: AwesomeStorageItem) {
    if (target.expire) {
      const currentDate = new Date();
      currentDate.setHours(currentDate.getHours() - 1);

      const targetExpireDate = new Date(target.expire * 1000);
      // const isBefore = currentDate.getTime() < targetExpireDate.getTime();

      // return dayjs().add(-1, 'hour').isBefore(dayjs.unix(target.expire));
      return currentDate.getTime() < targetExpireDate.getTime();
    }
    return true;
  }
}
