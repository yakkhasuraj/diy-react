// const element = {
//   type: 'h1',
//   props: {
//     title: 'foo',
//     children: 'Hello World',
//   },
// };
// const container = document.getElementById('root');
// const node = document.createElement(element.type);

// node['title'] = element.props.title;
// const text = document.createTextNode('');

// text['nodeValue'] = element.props.children;
// node.appendChild(text);

// container.appendChild(node);

function createTextElement(text) {
  return {
    type: 'TEXT_ELEMENT',
    props: {
      nodeValue: text,
      children: [],
    },
  };
}

function createElement(type, props, ...children) {
  return {
    type,
    props: {
      ...props,
      children: children.map((child) =>
        typeof child === 'object' ? child : createTextElement(child)
      ),
    },
  };
}

// console.log(createElement('div'));
// {
//     type: "div",
//     props: { children: [] }
// }
// console.log(createElement('div', null, 'a'));
// {
//     type: "div",
//     props: { children: ["a"] }
// }
// console.log(createElement('div', null, 'a', 'b'));
// {
//     type: "div",
//     props: { children: ["a", "b"] }
// }

const isEvent = (key) => key.startsWith('on');
const isProperty = (key) => key !== 'children' && !isEvent(key);
const isNew = (prev, next) => (key) => prev[key] !== next[key];
const isGone = (prev, next) => (key) => !(key in next);

function updateDom(dom, prevProps, nextProps) {
  // Remove old or changed event listeners
  Object.keys(prevProps)
    .filter(isEvent)
    .filter((key) => !(key in nextProps) || isNew(prevProps, nextProps)(key))
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2);
      dom.removeEventListener(eventType, prevProps[name]);
    });

  // Add event listeners
  Object.keys(nextProps)
    .filter(isEvent)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2);
      dom.addEventListener(eventType, nextProps[name]);
    });

  // Remove old properties
  Object.keys(prevProps)
    .filter(isProperty)
    .filter(isGone(prevProps, nextProps))
    .forEach((name) => {
      dom[name] = '';
    });

  // Set new or changed properties
  Object.keys(nextProps)
    .filter(isProperty)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      dom[name] = nextProps[name];
    });
}

function createDom(fiber) {
  const dom =
    fiber.type == 'TEXT_ELEMENT'
      ? document.createTextNode('')
      : document.createElement(fiber.type);

  // const isProperty = (key) => key !== 'children';
  // Object.keys(fiber.props)
  //   .filter(isProperty)
  //   .forEach((name) => (dom[name] = fiber.props[name]));

  updateDom(dom, {}, fiber.props);

  return dom;
}

function commitDeletion(fiber, domParent) {
  if (fiber.dom) {
    domParent.removeChild(fiber.dom);
  } else {
    commitDeletion(fiber.child, domParent);
  }
}

function commitWork(fiber) {
  if (!fiber) {
    return;
  }

  let domParentFiber = fiber.parent;
  while (!domParentFiber.dom) {
    domParentFiber = domParentFiber.parent;
  }
  // const domParent = fiber.parent.dom;
  const domParent = domParentFiber.dom;

  if (fiber.effectTag === 'PLACEMENT' && fiber.dom != null) {
    domParent.appendChild(fiber.dom);
  } else if (fiber.effectTag === 'UPDATE' && fiber.dom != null) {
    updateDom(fiber.dom, fiber.alternate.props, fiber.props);
  } else if (fiber.effectTag === 'DELETION') {
    // domParent.removeChild(fiber.dom);
    commitDeletion(fiber, domParent);
  }

  commitWork(fiber.child);
  commitWork(fiber.sibling);
}

let wipRoot = null;
let currentRoot = null;

function commitRoot() {
  deletions.forEach(commitWork);
  commitWork(wipRoot.child);
  currentRoot = wipRoot;
  wipRoot = null;
}

function reconcileChildren(wipFiber, elements) {
  let index = 0;
  let oldFiber = wipFiber.alternate && wipFiber.alternate.child;
  let prevSibling = null;

  while (index < elements.length || oldFiber != null) {
    const element = elements[index];
    let newFiber = null;

    const sameType = oldFiber && element && element.type == oldFiber.type;

    if (sameType) {
      newFiber = {
        type: oldFiber.type,
        props: element.props,
        dom: oldFiber.dom,
        parent: wipFiber,
        alternate: oldFiber,
        effectTag: 'UPDATE',
      };
    }

    if (element && !sameType) {
      newFiber = {
        type: element.type,
        props: element.props,
        dom: null,
        parent: wipFiber,
        alternate: null,
        effectTag: 'PLACEMENT',
      };
    }

    if (oldFiber && !sameType) {
      oldFiber.effectTag = 'DELETION';
      deletions.push(oldFiber);
    }

    if (oldFiber) {
      oldFiber = oldFiber.sibling;
    }

    // const newFiber = {
    //   type: element.type,
    //   props: element.props,
    //   parent: fiber,
    //   dom: null,
    // };

    if (index === 0) {
      wipFiber.child = newFiber;
    } else if (element) {
      prevSibling.sibling = newFiber;
    }

    prevSibling = newFiber;
    index++;
  }
}

let wipFiber = null;
let hookIndex = null;

function updateFunctionComponent(fiber) {
  wipFiber = fiber;
  hookIndex = 0;
  wipFiber.hooks = [];
  const children = [fiber.type(fiber.props)];
  reconcileChildren(fiber, children);
}

function useState(initial) {
  const oldHook =
    wipFiber.alternate &&
    wipFiber.alternate.hooks &&
    wipFiber.alternate.hooks[hookIndex];

  const hook = {
    state: oldHook ? oldHook.state : initial,
    queue: [],
  };

  const actions = oldHook ? oldHook.queue : [];
  actions.forEach((action) => {
    hook.state = action(hook.state);
  });

  const setState = (action) => {
    hook.queue.push(action);
    wipRoot = {
      dom: currentRoot.dom,
      props: currentRoot.props,
      alternate: currentRoot,
    };
    nextUnitOfWork = wipRoot;
    deletions = [];
  };

  wipFiber.hooks.push(hook);
  hookIndex++;
  return [hook.state, setState];
}

function updateHostComponent(fiber) {
  if (!fiber.dom) {
    fiber.dom = createDom(fiber);
  }
  reconcileChildren(fiber, fiber.props.children);
}

function render(element, container) {
  // const dom =
  //   element.type === 'TEXT_ELEMENT'
  //     ? document.createTextNode('')
  //     : document.createElement(element.type);

  // const isProperty = (key) => key !== 'children';
  // Object.keys(element.props)
  //   .filter(isProperty)
  //   .forEach((name) => (dom[name] = element.props[name]));

  // element.props.children.forEach((child) => render(child, dom));

  // container.appendChild(dom);
  wipRoot = {
    dom: container,
    props: {
      children: [element],
    },
    alternate: currentRoot,
  };
  deletions = [];
  nextUnitOfWork = wipRoot;
}

function performUnitOfWork(fiber) {
  const isFunctionComponent = fiber.type instanceof Function;
  if (isFunctionComponent) {
    updateFunctionComponent(fiber);
  } else {
    updateHostComponent(fiber);
  }

  if (fiber.child) {
    return fiber.child;
  }

  // if (fiber.parent) {
  //   fiber.parent.dom.appendChild(fiber.dom);
  // }

  // const elements = fiber.props.children;
  // reconcileChildren(fiber, elements);
  // let index = 0;
  // let prevSibling = null;

  // while (index < elements.length) {
  //   const elements = elements[index];

  //   const newFiber = {
  //     type: element.type,
  //     props: element.props,
  //     parent: fiber,
  //     dom: null,
  //   };

  //   if (index == 0) {
  //     fiber.child = newFiber;
  //   } else {
  //     prevSibling.sibling = newFiber;
  //   }

  //   prevSibling = newFiber;
  //   index++;
  // }

  let nextFiber = fiber;
  while (nextFiber) {
    if (nextFiber.sibling) {
      return nextFiber.sibling;
    }
    nextFiber = nextFiber.parent;
  }
}

let nextUnitOfWork = null;
let deletions = null;

function workLoop(deadline) {
  let shouldYield = false;
  while (nextUnitOfWork && !shouldYield) {
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
    shouldYield = deadline.timeRemaining() < 1;
  }

  if (!nextUnitOfWork && wipRoot) {
    commitRoot();
  }

  requestIdleCallback(workLoop);
}

requestIdleCallback(workLoop);

const Didact = {
  createElement,
  render,
  useState,
};

// const element = Didact.createElement(
//   'div',
//   { id: 'foo' },
//   Didact.createElement('a', null, 'bar'),
//   Didact.createElement('b')
// );

/** @jsx Didact.createElement */
// const element = (
//   <div id="foo">
//     <a>bar</a>
//     <b />
//   </div>
// );

// function App(props) {
//   return <h1>Hi {props.name}</h1>;
// }
// const element = <App name="foo" />;

function Counter() {
  const [state, setState] = Didact.useState(1);
  return <h1 onClick={() => setState((c) => c + 1)}>Count: {state}</h1>;
}

const element = <Counter />;
const container = document.getElementById('root');
Didact.render(element, container);
