import { Dispatch } from './types/store'
import {
  AnyAction,
  ActionCreator,
  ActionCreatorsMapObject
} from './types/actions'
import { kindOf } from './utils/kindOf'

/**
 * 给单个 action 绑定 dispatch 函数
 * @param actionCreator 一个 action creator 函数
 * @param dispatch store.dispatch 方法
 * @returns 返回一个函数，这个函数直接调用就相当于 dispatch 一个对应的 action
 */
function bindActionCreator<A extends AnyAction = AnyAction>(
  actionCreator: ActionCreator<A>,
  dispatch: Dispatch
) {
  return function (this: any, ...args: any[]) {
    return dispatch(actionCreator.apply(this, args))
  }
}

/**
 * 把一个值都是 action creator 的对象转化成另一个有着相同键的对象，
 * 但是每个函数都封装了一个 `dispatch` 调用进去，所以都能被直接调用。
 * 这是个简便方法，你可以自己调用 `store.dispatch(MyActionCreators.doSomething())`
 * 
 * 为了方便，你也能传一个 action creator 进去作为第一个参数，
 * 返回值得到了一个 封装了 dispatch 的函数
 *
 * @param actionCreators 一个值都是 action creator 函数的对象。
 * 一个简单的获得方法就是使用 ES6 语法 `import * as`，
 * 你也可以传单个函数。
 *
 * @param dispatch Redux store 中可用的 `dispatch` 函数。
 *
 * @returns 模仿原始对象的对象，但是每个 action creator 都封装进了 `dispatch` 调用。
 * 如果你传入一个函数比如 `actionCreators` ，返回值仍然是单个函数。
 */
export default function bindActionCreators<A, C extends ActionCreator<A>>(
  actionCreator: C,
  dispatch: Dispatch
): C

export default function bindActionCreators<
  A extends ActionCreator<any>,
  B extends ActionCreator<any>
>(actionCreator: A, dispatch: Dispatch): B

export default function bindActionCreators<
  A,
  M extends ActionCreatorsMapObject<A>
>(actionCreators: M, dispatch: Dispatch): M
export default function bindActionCreators<
  M extends ActionCreatorsMapObject,
  N extends ActionCreatorsMapObject
>(actionCreators: M, dispatch: Dispatch): N

export default function bindActionCreators(
  actionCreators: ActionCreator<any> | ActionCreatorsMapObject,
  dispatch: Dispatch
) {
  if (typeof actionCreators === 'function') {
    return bindActionCreator(actionCreators, dispatch)
  }

  if (typeof actionCreators !== 'object' || actionCreators === null) {
    throw new Error(
      `bindActionCreators expected an object or a function, but instead received: '${kindOf(
        actionCreators
      )}'. ` +
        `Did you write "import ActionCreators from" instead of "import * as ActionCreators from"?`
    )
  }

  const boundActionCreators: ActionCreatorsMapObject = {}
  for (const key in actionCreators) {
    const actionCreator = actionCreators[key]
    if (typeof actionCreator === 'function') {
      boundActionCreators[key] = bindActionCreator(actionCreator, dispatch)
    }
  }
  return boundActionCreators
}
