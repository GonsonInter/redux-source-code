import { Action, AnyAction } from './actions'
import { Reducer } from './reducers'
import '../utils/symbol-observable'

/**
 * Extend the state
 *
 * This is used by store enhancers and store creators to extend state.
 * If there is no state extension, it just returns the state, as is, otherwise
 * it returns the state joined with its extension.
 *
 * Reference for future devs:
 * https://github.com/microsoft/TypeScript/issues/31751#issuecomment-498526919
 */
export type ExtendState<State, Extension> = [Extension] extends [never]
  ? State
  : State & Extension

/**
 * Internal "virtual" symbol used to make the `CombinedState` type unique.
 */
declare const $CombinedState: unique symbol

/**
 * State base type for reducers created with `combineReducers()`.
 *
 * This type allows the `createStore()` method to infer which levels of the
 * preloaded state can be partial.
 *
 * Because Typescript is really duck-typed, a type needs to have some
 * identifying property to differentiate it from other types with matching
 * prototypes for type checking purposes. That's why this type has the
 * `$CombinedState` symbol property. Without the property, this type would
 * match any object. The symbol doesn't really exist because it's an internal
 * (i.e. not exported), and internally we never check its value. Since it's a
 * symbol property, it's not expected to be unumerable, and the value is
 * typed as always undefined, so its never expected to have a meaningful
 * value anyway. It just makes this type distinguishable from plain `{}`.
 */
interface EmptyObject {
  readonly [$CombinedState]?: undefined
}
export type CombinedState<S> = EmptyObject & S

/**
 * Recursively makes combined state objects partial. Only combined state _root
 * objects_ (i.e. the generated higher level object with keys mapping to
 * individual reducers) are partial.
 */
export type PreloadedState<S> = Required<S> extends EmptyObject
  ? S extends CombinedState<infer S1>
    ? {
        [K in keyof S1]?: S1[K] extends object ? PreloadedState<S1[K]> : S1[K]
      }
    : S
  : {
      [K in keyof S]: S[K] extends string | number | boolean | symbol
        ? S[K]
        : PreloadedState<S[K]>
    }

/**
 * A *dispatching function* (or simply *dispatch function*) is a function that
 * accepts an action or an async action; it then may or may not dispatch one
 * or more actions to the store.
 *
 * We must distinguish between dispatching functions in general and the base
 * `dispatch` function provided by the store instance without any middleware.
 *
 * The base dispatch function *always* synchronously sends an action to the
 * store's reducer, along with the previous state returned by the store, to
 * calculate a new state. It expects actions to be plain objects ready to be
 * consumed by the reducer.
 *
 * Middleware wraps the base dispatch function. It allows the dispatch
 * function to handle async actions in addition to actions. Middleware may
 * transform, delay, ignore, or otherwise interpret actions or async actions
 * before passing them to the next middleware.
 *
 * @template A The type of things (actions or otherwise) which may be
 *   dispatched.
 */
export interface Dispatch<A extends Action = AnyAction> {
  <T extends A>(action: T, ...extraArgs: any[]): T
}

/**
 * Function to remove listener added by `Store.subscribe()`.
 */
export interface Unsubscribe {
  (): void
}

declare global {
  interface SymbolConstructor {
    readonly observable: symbol
  }
}

/**
 * A minimal observable of state changes.
 * For more information, see the observable proposal:
 * https://github.com/tc39/proposal-observable
 */
export type Observable<T> = {
  /**
   * The minimal observable subscription method.
   * @param {Object} observer Any object that can be used as an observer.
   * The observer object should have a `next` method.
   * @returns {subscription} An object with an `unsubscribe` method that can
   * be used to unsubscribe the observable from the store, and prevent further
   * emission of values from the observable.
   */
  subscribe: (observer: Observer<T>) => { unsubscribe: Unsubscribe }
  [Symbol.observable](): Observable<T>
}

/**
 * An Observer is used to receive data from an Observable, and is supplied as
 * an argument to subscribe.
 */
export type Observer<T> = {
  next?(value: T): void
}

/**
 * store 是一个维护 app 状态树的对象
 * 一个 redux app 只能有一个 store，拆分和组合只能发生在 reducer 层面中
 *
 * @template S The type of state held by this store.
 * @template A the type of actions which may be dispatched by this store.
 * @template StateExt any extension to state from store enhancers
 * @template Ext any extensions to the store from store enhancers
 */
export interface Store<
  S = any,
  A extends Action = AnyAction,
  StateExt = never,
  Ext = {}
> {
  /**
   * dispatch action。触发 state 更新的唯一方法
   * 
   * 创建 store 的时候要传入一个 reducer 函数，调 diapatch 函数的时候就会调那个 reducer 方法，
   * 并传入对应的 action
   * dispatch 方法会产生一个新的 state tree，且所有的监听者都会被通知
   * 
   * 基础实现仅支持普通js对象的 action，如果想要 dispatch promise、observable、thunk
   * 或其他什么东西要使用 middleware。举例，可以去看 redux-thunk 包的文档。
   * 但是使用 middleware 之后最终也会使用这个方法 dispatch 一个普通js对象 action
   *
   * @param action A plain object representing “what changed”. It is a good
   *   idea to keep actions serializable so you can record and replay user
   *   sessions, or use the time travelling `redux-devtools`. An action must
   *   have a `type` property which may not be `undefined`. It is a good idea
   *   to use string constants for action types.
   *
   * @returns For convenience, the same action object you dispatched.
   *
   * Note that, if you use a custom middleware, it may wrap `dispatch()` to
   * return something else (for example, a Promise you can await).
   */
  dispatch: Dispatch<A>

  /**
   * 获取 store 维护的 state
   *
   * @returns The current state tree of your application.
   */
  getState(): S

  /**
   * 添加一个变化监听者。
   * 任意 action 被 dispatch 的时候都会被调用，state 树的某个部分可能会被更新了。
   * 可以在传入的回调函数中调用 getState 来获取最新的 state 树。
   *
   * You may call `dispatch()` from a change listener, with the following
   * caveats:
   *
   * 1. The subscriptions are snapshotted just before every `dispatch()` call.
   * If you subscribe or unsubscribe while the listeners are being invoked,
   * this will not have any effect on the `dispatch()` that is currently in
   * progress. However, the next `dispatch()` call, whether nested or not,
   * will use a more recent snapshot of the subscription list.
   *
   * 2. The listener should not expect to see all states changes, as the state
   * might have been updated multiple times during a nested `dispatch()` before
   * the listener is called. It is, however, guaranteed that all subscribers
   * registered before the `dispatch()` started will be called with the latest
   * state by the time it exits.
   *
   * @param listener A callback to be invoked on every dispatch.
   * @returns A function to remove this change listener.
   */
  subscribe(listener: () => void): Unsubscribe

  /**
   * 替换当前 store 用来计算最新 state 的 reducer 函数
   * 
   * app 如果实现了 code splitting，那可能要动态加载 reducer。
   * 如果对 redux 要实现热重载，也可能要用到这个方法
   *
   * @param nextReducer 返回新替换了 reducer 的 store
   */
  replaceReducer<NewState, NewActions extends Action>(
    nextReducer: Reducer<NewState, NewActions>
  ): Store<ExtendState<NewState, StateExt>, NewActions, StateExt, Ext> & Ext

  /**
   * 观察者/响应式库的互操作点。
   * 
   * @returns {observable} 变化的最小 observable.
   * 详情可以查看 observable 提案:
   * https://github.com/tc39/proposal-observable
   */
  [Symbol.observable](): Observable<S>
}

/**
 * A store creator is a function that creates a Redux store. Like with
 * dispatching function, we must distinguish the base store creator,
 * `createStore(reducer, preloadedState)` exported from the Redux package, from
 * store creators that are returned from the store enhancers.
 *
 * @template S The type of state to be held by the store.
 * @template A The type of actions which may be dispatched.
 * @template Ext Store extension that is mixed in to the Store type.
 * @template StateExt State extension that is mixed into the state type.
 */
export interface StoreCreator {
  <S, A extends Action, Ext = {}, StateExt = never>(
    reducer: Reducer<S, A>,
    enhancer?: StoreEnhancer<Ext, StateExt>
  ): Store<ExtendState<S, StateExt>, A, StateExt, Ext> & Ext
  <S, A extends Action, Ext = {}, StateExt = never>(
    reducer: Reducer<S, A>,
    preloadedState?: PreloadedState<S>,
    enhancer?: StoreEnhancer<Ext>
  ): Store<ExtendState<S, StateExt>, A, StateExt, Ext> & Ext
}

/**
 * store enhancer 是一个高阶函数，将一个 store creator 组装成一个新的，增强过的
 * store creator。和 middleware 相似，以组合式方式更改 store。
 *
 * Store enhancers are much the same concept as higher-order components in
 * React, which are also occasionally called “component enhancers”.
 *
 * Because a store is not an instance, but rather a plain-object collection of
 * functions, copies can be easily created and modified without mutating the
 * original store. There is an example in `compose` documentation
 * demonstrating that.
 *
 * Most likely you'll never write a store enhancer, but you may use the one
 * provided by the developer tools. It is what makes time travel possible
 * without the app being aware it is happening. Amusingly, the Redux
 * middleware implementation is itself a store enhancer.
 *
 * @template Ext Store extension that is mixed into the Store type.
 * @template StateExt State extension that is mixed into the state type.
 */
export type StoreEnhancer<Ext = {}, StateExt = never> = (
  next: StoreEnhancerStoreCreator<Ext, StateExt>
) => StoreEnhancerStoreCreator<Ext, StateExt>

/** 增强过的 storeCreator 类型 */
export type StoreEnhancerStoreCreator<Ext = {}, StateExt = never> = <
  S = any,
  A extends Action = AnyAction
>(
  reducer: Reducer<S, A>,
  preloadedState?: PreloadedState<S>
) => Store<ExtendState<S, StateExt>, A, StateExt, Ext> & Ext
