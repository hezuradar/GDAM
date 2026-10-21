/**
 * Guard for the Rules of Hooks: a hook called after a conditional `return` makes React
 * throw "Rendered more hooks than during the previous render" and the screen stays blank.
 *
 * `eslint-plugin-react-hooks` is not installed in this project, so the check runs over the
 * TypeScript AST instead (typescript is already a dependency).
 */
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

const ROOT = path.resolve(__dirname, '..', '..');
const SCAN_DIR = path.join(ROOT, 'src');
const SKIP_DIR = path.join(ROOT, 'src', 'worker');

/** A hook call: useState, useMemo, useCallback, useLoader, … */
const HOOK_NAME = /^use[A-Z]/;
/** Components (capitalised) and custom hooks (use…) are the functions where the rule applies. */
const ANALYSED_NAME = /^(?:[A-Z]|use[A-Z])/;

const isComponentOrHook = (name: string): boolean => ANALYSED_NAME.test(name);

type Violation = { file: string; functionName: string; hook: string; line: number; rule: string };

function collectFiles(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (full === SKIP_DIR) continue;
    if (entry.isDirectory()) collectFiles(full, out);
    else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

/** Functions have their own hook scope: their contents are analysed separately. */
function isFunctionLike(node: ts.Node): boolean {
  return (
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessor(node) ||
    ts.isSetAccessor(node)
  );
}

function collectFunctions(node: ts.Node, out: ts.FunctionLikeDeclaration[] = []): ts.FunctionLikeDeclaration[] {
  if (isFunctionLike(node)) out.push(node as ts.FunctionLikeDeclaration);
  // The callback must not return a value: forEachChild stops iterating on a truthy result.
  ts.forEachChild(node, (child) => {
    collectFunctions(child, out);
  });
  return out;
}

function functionName(fn: ts.FunctionLikeDeclaration): string | null {
  if (fn.name && ts.isIdentifier(fn.name)) return fn.name.text;
  const parent = fn.parent;
  if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
  return null;
}

/** Hook calls in a statement, ignoring the ones that belong to a nested function. */
function collectHookCalls(node: ts.Node): { name: string; pos: number }[] {
  const found: { name: string; pos: number }[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && HOOK_NAME.test(n.expression.text)) {
      found.push({ name: n.expression.text, pos: n.getStart() });
    }
    ts.forEachChild(n, (child) => {
      if (isFunctionLike(child)) return;
      visit(child);
    });
  };
  visit(node);
  return found;
}

/** True when the statement can exit the component early (a return not owned by a nested function). */
function containsReturn(node: ts.Node): boolean {
  let found = false;
  const visit = (n: ts.Node) => {
    if (found) return;
    if (ts.isReturnStatement(n)) {
      found = true;
      return;
    }
    if (isFunctionLike(n)) return;
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

function analyseFile(file: string): Violation[] {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const violations: Violation[] = [];
  const relative = path.relative(ROOT, file);
  const lineOf = (pos: number) => source.getLineAndCharacterOfPosition(pos).line + 1;

  for (const fn of collectFunctions(source)) {
    const name = functionName(fn);
    const body = fn.body;
    if (!body || !ts.isBlock(body)) continue;
    const label = name ?? 'callback';

    if (name && isComponentOrHook(name)) {
      // Rule 1: a hook must not run after a return that can skip the rest of the component.
      let earlyReturn = false;
      for (const statement of body.statements) {
        if (earlyReturn) {
          for (const hook of collectHookCalls(statement)) {
            violations.push({
              file: relative,
              functionName: label,
              hook: hook.name,
              line: lineOf(hook.pos),
              rule: 'se llama despues de un return temprano',
            });
          }
        }
        if (containsReturn(statement)) earlyReturn = true;
      }
    } else {
      // Rule 2: a hook must not run inside a callback (useEffect, useMemo, …): those are not
      // a valid place to call a hook.
      for (const hook of collectHookCalls(body)) {
        violations.push({
          file: relative,
          functionName: label,
          hook: hook.name,
          line: lineOf(hook.pos),
          rule: 'se llama dentro de un callback',
        });
      }
    }
  }
  return violations;
}

describe('Rules of Hooks', () => {
  const files = collectFiles(SCAN_DIR);

  it('finds the source files to analyse', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('never calls a hook in an invalid position', () => {
    const violations = files.flatMap(analyseFile);
    const report = violations
      .map((v) => `${v.file}:${v.line} — ${v.functionName}() ${v.rule}: ${v.hook}()`)
      .join('\n');
    expect(report).toBe('');
  });
});
