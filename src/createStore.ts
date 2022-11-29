import $$observable from './utils/symbol-observable'

import {
  Store,
  PreloadedState,
  StoreEnhancer,
  Dispatch,
  Observer,
  ExtendState
} from './types/store'
import { Action } from './types/actions'
import { Reducer } from './types/reducers'
import ActionTypes from './utils/actionTypes'
import isPlainObject from './utils/isPlainObject'
import { kindOf } from './utils/kindOf'

/**
 * 创建一个 Redux store 来持有整个 state 树。
 * 唯一改变 store 中数据的方法是对它调用 `dispatch()`。
 *
 * app 中应该只有单一的 store。为了弄清楚 state 树如何针对 state 树的不同部分进行响应，
 * 也可以使用 `combineReducers` 来将多个 reducer 组合到单一的 reducer 函数中去
 *
 * @param reducer 一个返回下一个 state 树的函数，需要接收当前的 state 树和要处理的 action。
 *
 * @param preloadedState 初始 state。
 * 你可以选择指定它以在通用 app 中从服务器还原状态，或还原以前序列化的用户会话。
 * 如果你使用 `combineReducers` 来生成根 reducer 函数，
 * 那么该函数必须是与 `combineReducers` 的键具有相同形状的对象。
 *
 * @param enhancer store enhancer。 
 * 你可以选择指定它以使用第三方功能（如 middleware、时间旅行、持久性等）增强 store。
 * Redux附带的唯一 store enhancer 是 `applyMiddleware()`。
 *
 * @returns 一个 redux store，让你可以读取 state，dispatch action，并订阅 state 变化
 */
export default function createStore<
  S,
  A extends Action,
  Ext = {},
  StateExt = never
>(
  reducer: Reducer<S, A>,
  enhancer?: StoreEnhancer<Ext, StateExt>
): Store<ExtendState<S, StateExt>, A, StateExt, Ext> & Ext

/** 重载1 */
export default function createStore<
  S,
  A extends Action,
  Ext = {},
  StateExt = never
>(
  reducer: Reducer<S, A>,
  preloadedState?: PreloadedState<S>,
  enhancer?: StoreEnhancer<Ext, StateExt>
): Store<ExtendState<S, StateExt>, A, StateExt, Ext> & Ext

/** 重载2 */
export default function createStore<
  S,
  A extends Action,
  Ext = {},
  StateExt = never
>(
  reducer: Reducer<S, A>,
  preloadedState?: PreloadedState<S> | StoreEnhancer<Ext, StateExt>,
  enhancer?: StoreEnhancer<Ext, StateExt>
): Store<ExtendState<S, StateExt>, A, StateExt, Ext> & Ext {
  if (
    (typeof preloadedState === 'function' && typeof enhancer === 'function') ||
    (typeof enhancer === 'function' && typeof arguments[3] === 'function')
  ) {
    throw new Error(
      'It looks like you are passing several store enhancers to ' +
        'createStore(). This is not supported. Instead, compose them ' +
        'together to a single function. See https://redux.js.org/tutorials/fundamentals/part-4-store#creating-a-store-with-enhancers for an example.'
    )
  }

  if (typeof preloadedState === 'function' && typeof enhancer === 'undefined') {
    enhancer = preloadedState as StoreEnhancer<Ext, StateExt>
    preloadedState = undefined
  }

  if (typeof enhancer !== 'undefined') {
    if (typeof enhancer !== 'function') {
      throw new Error(
        `Expected the enhancer to be a function. Instead, received: '${kindOf(
          enhancer
        )}'`
      )
    }

    return enhancer(createStore)(
      reducer,
      preloadedState as PreloadedState<S>
    ) as Store<ExtendState<S, StateExt>, A, StateExt, Ext> & Ext
  }

  if (typeof reducer !== 'function') {
    throw new Error(
      `Expected the root reducer to be a function. Instead, received: '${kindOf(
        reducer
      )}'`
    )
  }

  let currentReducer = reducer
  let currentState = preloadedState as S
  let currentListeners: (() => void)[] | null = []
  let nextListeners = currentListeners
  let isDispatching = false

  /**
   * 对 currentListeners 做一次浅拷贝，
   * 使得我们在 dispatch 过程中可以使用 nextListeners 作为临时的 list
   * 
   * 这一步防止了任何 数据消费者 在 dispatch 过程中
   * 调用 subscribe/unsubscribe 出现的错误
   */
  function ensureCanMutateNextListeners() {
    if (nextListeners === currentListeners) {
      nextListeners = currentListeners.slice()
    }
  }

  /**
   * 读取 store 管理的 state 树。
   *
   * @returns 当前 app 的 state 树
   */
  function getState(): S {
    if (isDispatching) {
      throw new Error(
        'You may not call store.getState() while the reducer is executing. ' +
          'The reducer has already received the state as an argument. ' +
          'Pass it down from the top reducer instead of reading it from the store.'
      )
    }

    return currentState as S
  }

  /**
   * 添加一个 listener。在 action 被 dispatch 的时候，
   * 或 state tree 中的某些部分可能改变时被随时调用，
   * 你可以再回调函数中调用 `getState()` 来读取当前的 state 
   * 
   * 你可以从一个 listener 调用 `getState()`，但是伴随有以下警告：
   * 
   * 1. 每个订阅都是在每个 `dispatch()` 调用之前的快照。
   * 如果你在 listener 正在被调用的时候 subscribe 或 unsubscribe，那么对于当前的 `dispatch()`
   * 流程来说根本没用。
   * 但是，下一次的 `dispatch()` 调用，无论是不是嵌套的调用，都会带上最新的 订阅 list 的快照。
   * 
   * 2. listener 不应该盯着所有的 state 更改，因为在 listener 被调用之前 state 可能会
   * 在嵌套 `dispatch()` 过程中被多次更新。
   * 但是，可以保证在 `dispatch()` 启动之前注册的所有 listener 保证以最新状态调用。
   *
   * @param listener 每次调用 dispatch 的时候都被触发的回调.
   * @returns 一个移除此 listener 的函数.
   */
  function subscribe(listener: () => void) {
    if (typeof listener !== 'function') {
      throw new Error(
        `Expected the listener to be a function. Instead, received: '${kindOf(
          listener
        )}'`
      )
    }

    if (isDispatching) {
      throw new Error(
        'You may not call store.subscribe() while the reducer is executing. ' +
          'If you would like to be notified after the store has been updated, subscribe from a ' +
          'component and invoke store.getState() in the callback to access the latest state. ' +
          'See https://redux.js.org/api/store#subscribelistener for more details.'
      )
    }

    let isSubscribed = true

    /**
     * 对于 nextListeners 也用的是不可变更新方式，
     * 以免在正在 dispatch 的时候添加或者移出 listener 发生错误
     * 也就是说，只有在对应 action 被 dispatch 之前添加或者移除 listener 才有效
     */
    ensureCanMutateNextListeners()
    nextListeners.push(listener)

    return function unsubscribe() {
      if (!isSubscribed) {
        return
      }

      if (isDispatching) {
        throw new Error(
          'You may not unsubscribe from a store listener while the reducer is executing. ' +
            'See https://redux.js.org/api/store#subscribelistener for more details.'
        )
      }

      isSubscribed = false

      ensureCanMutateNextListeners()
      const index = nextListeners.indexOf(listener)
      nextListeners.splice(index, 1)
      currentListeners = null
    }
  }

  /**
   * dispatche 一个 action。这是改变 state 的唯一方法。
   *
   * 用来创建 store 的 `reducer` 函数，将会根据当前的 state 树和给定 action被调用。
   * 它的返回解雇将会被视作 **下一个** state，并且会通知 listener。
   * 
   * 基本实现仅仅支持普通的 action 对象。日过想要 dispatch 一个 Promise，Observable，
   * thunk 等，你得使用对应的 middleware 封装 store 创建函数。例如，可以去看 
   * `redux-thunk` 包的文档。虽然 middleware 最终也是通过这个方法 dispatch 一个普通对象。
   *
   * @param action 一个用来表示“发生什么”的普通对象。 
   * 这样 action 能被序列化，你就可以记录和重现用户的会话，或者使用 `redux-devtools 完成时间旅行调试。
   * 一个 action 必须有 `type` 属性，且不能为 `undefined`。
   * 使用字符串常量来定义这个属性是个好主意
   *
   * @returns 为了方便，返回你 dispatch 的那个原对象
   *
   * 注意到，如果你使用一个通用 middleware，他可能会封装 `dispatch()` 从而返回一些其他东西
   * （比如，返回一个 Promise 你能 await）。
   */
  function dispatch(action: A) {
    if (!isPlainObject(action)) {
      throw new Error(
        `Actions must be plain objects. Instead, the actual type was: '${kindOf(
          action
        )}'. You may need to add middleware to your store setup to handle dispatching other values, such as 'redux-thunk' to handle dispatching functions. See https://redux.js.org/tutorials/fundamentals/part-4-store#middleware and https://redux.js.org/tutorials/fundamentals/part-6-async-logic#using-the-redux-thunk-middleware for examples.`
      )
    }

    // action 必须拥有 type 字段
    if (typeof action.type === 'undefined') {
      throw new Error(
        'Actions may not have an undefined "type" property. You may have misspelled an action type string constant.'
      )
    }

    if (isDispatching) {
      throw new Error('Reducers may not dispatch actions.')
    }

    try {
      isDispatching = true
      currentState = currentReducer(currentState, action)
    } finally {
      isDispatching = false
    }

    // 依次通知 listener
    const listeners = (currentListeners = nextListeners)
    for (let i = 0; i < listeners.length; i++) {
      const listener = listeners[i]
      listener()
    }

    return action
  }

  /**
   * 替换当前 store 使用的 reducer 来计算 state。
   * 
   * 可能你的 app 需要代码分割并动态加载一些 reducer，也可能要实现一些 redux 热重载机制
   *
   * @param nextReducer 给 store 替换的那个 reducer
   * @returns 替换过 reducer 的同一个 store 实例
   */
  function replaceReducer<NewState, NewActions extends A>(
    nextReducer: Reducer<NewState, NewActions>
  ): Store<ExtendState<NewState, StateExt>, NewActions, StateExt, Ext> & Ext {
    if (typeof nextReducer !== 'function') {
      throw new Error(
        `Expected the nextReducer to be a function. Instead, received: '${kindOf(
          nextReducer
        )}`
      )
    }

    // TODO：现在的实现不够优雅
    ;(currentReducer as unknown as Reducer<NewState, NewActions>) = nextReducer

    // 这个 action 和 ActionTypes.INIT 效果一样
    // 新的和旧的 rootReducer 中存在的任何 Reducer 都将接收以前的状态。
    // 这将使用旧 state 树中的任何相关数据有效地填充新 state 树。
    dispatch({ type: ActionTypes.REPLACE } as A)
    // 通过强转类型为新 store 来改变 store 类型
    return store as unknown as Store<
      ExtendState<NewState, StateExt>,
      NewActions,
      StateExt,
      Ext
    > &
      Ext
  }

  /**
   * 观察式/响应式库的交互切点
   * @returns state 变化的最小可观察。
   * 有关更多信息，请参阅可观察提案：
   * https://github.com/tc39/proposal-observable
   */
  function observable() {
    const outerSubscribe = subscribe
    return {
      /**
       * 最小的 observable 订阅的方法
       * @param observer 可以被用作 observer 的任何对象
       * observer 对象都应该有 `next` 方法。
       * @returns 一个具有 `unsubscribe` 方法的对象，这个对象可以用来从 store 取消订阅 observable,
       * 并防止进一步从 observable 获得值
       */
      subscribe(observer: unknown) {
        if (typeof observer !== 'object' || observer === null) {
          throw new TypeError(
            `Expected the observer to be an object. Instead, received: '${kindOf(
              observer
            )}'`
          )
        }

        function observeState() {
          const observerAsObserver = observer as Observer<S>
          if (observerAsObserver.next) {
            observerAsObserver.next(getState())
          }
        }

        observeState()
        const unsubscribe = outerSubscribe(observeState)
        return { unsubscribe }
      },

      [$$observable]() {
        return this
      }
    }
  }

  // 当 store 被初始化以后，一个 "INIT" action 就会被 dispatch，这样每个 reducer 返回他们的初始 state。
  // 这有效地填充了初始 state 树。
  dispatch({ type: ActionTypes.INIT } as A)

  const store = {
    dispatch: dispatch as Dispatch<A>,
    subscribe,
    getState,
    replaceReducer,
    [$$observable]: observable
  } as unknown as Store<ExtendState<S, StateExt>, A, StateExt, Ext> & Ext
  return store
}
