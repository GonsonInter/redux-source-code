/**
 * @param obj The object to inspect.
 * @returns True if the argument appears to be a plain object.
 */
export default function isPlainObject(obj: any): boolean {
  if (typeof obj !== 'object' || obj === null) return false

  let proto = obj
  // 当 proto === Object.prototype 时会跳出循环
  while (Object.getPrototypeOf(proto) !== null) {
    proto = Object.getPrototypeOf(proto)
  }
  // 判断原型链的 首是否等于尾
  return Object.getPrototypeOf(obj) === proto
}

/**
 * 通过 {} 或者 new Object() 方式创建的对象是纯粹对象
 * isPlainObject 函数的功能的判断依据与对象使用什么方式创建无关，而与的函数原型是否是 Object.prototype 有关系
 */
