import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { describe, test } from "node:test";
import { canOpenUsers, isUsersPath } from "./access";
import type { Tx } from "./d1";
import { parseLoginEmail } from "./login-email";
import { hashPassword, passwordMatches } from "./password";
import { changeUserRole, insertUserRecord, prepareNewUser, removeUserRecord, type PreparedUser } from "./users";

describe("login email", () => {
  test("accepts a placeholder .test address", () => {
    // Shape only. This is not a mailbox and it is not a seeded account.
    assert.equal(parseLoginEmail("david@masten.test"), "david@masten.test");
    assert.equal(parseLoginEmail("  David@Masten.TEST "), "david@masten.test");
    assert.equal(parseLoginEmail("david+board@masten.test"), "david+board@masten.test");
  });

  test("rejects addresses that are not a login", () => {
    assert.equal(parseLoginEmail(""), null);
    assert.equal(parseLoginEmail("david"), null);
    assert.equal(parseLoginEmail("david@"), null);
    assert.equal(parseLoginEmail("@masten.test"), null);
    assert.equal(parseLoginEmail("david masten@masten.test"), null);
    assert.equal(parseLoginEmail("david@@masten.test"), null);
  });
});

describe("password hash", () => {
  test("uses the same bcrypt check the login uses", () => {
    const hash = hashPassword("test-password");
    assert.match(hash, /^\$2[aby]\$08\$/);
    assert.equal(passwordMatches("test-password", hash), true);
    assert.equal(passwordMatches("other-password", hash), false);
  });
});

describe("new user input", () => {
  test("accepts a .test login and hashes the password", () => {
    const prepared = prepareNewUser({
      name: "  Ada   Lane ",
      email: "Ada.Lane@masten.test",
      role: "staff",
      password: "test-password",
      confirm: "test-password",
    });
    assert.deepEqual(
      { name: prepared.name, email: prepared.email, role: prepared.role },
      { name: "Ada Lane", email: "ada.lane@masten.test", role: "staff" },
    );
    assert.equal(passwordMatches("test-password", prepared.passwordHash), true);
  });

  test("rejects a short password, a bad role, and an email that is not a login", () => {
    assert.throws(
      () =>
        prepareNewUser({
          name: "Ada Lane",
          email: "ada.lane@masten.test",
          role: "staff",
          password: "short",
          confirm: "short",
        }),
      /at least 8/,
    );
    assert.throws(
      () =>
        prepareNewUser({
          name: "Ada Lane",
          email: "ada.lane@masten.test",
          role: "owner",
          password: "test-password",
          confirm: "test-password",
        }),
      /admin or staff/,
    );
    assert.throws(
      () =>
        prepareNewUser({
          name: "Ada Lane",
          email: "not-an-email",
          role: "staff",
          password: "test-password",
          confirm: "test-password",
        }),
      /masten\.test/,
    );
  });
});

describe("users page access", () => {
  test("only an admin may open /users", () => {
    assert.equal(isUsersPath("/users"), true);
    assert.equal(isUsersPath("/users/"), true);
    assert.equal(isUsersPath("/users-archive"), false);
    assert.equal(isUsersPath("/"), false);
    assert.equal(canOpenUsers("admin"), true);
    assert.equal(canOpenUsers("staff"), false);
  });
});

describe("last admin", () => {
  test("keeps one admin, and lets that admin manage everyone else", async () => {
    const { tx } = openUsersDb();
    await add(tx, { id: "ada", email: "ada.lane@masten.test", name: "Ada Lane", role: "admin" });
    await add(tx, { id: "sam", email: "sam.cole@masten.test", name: "Sam Cole", role: "staff" });
    await tx.run("insert into card_assignees (card_id, user_id) values ('card-ada', 'ada')");
    await tx.run("insert into card_assignees (card_id, user_id) values ('card-sam', 'sam')");

    await assert.rejects(changeUserRole(tx, "ada", "staff"), /last admin/);
    await assert.rejects(removeUserRecord(tx, "ada"), /last admin/);
    assert.equal((await tx.all("select role from users where id = 'ada'"))[0]?.role, "admin");
    assert.equal((await tx.all("select user_id from card_assignees where user_id = 'ada'")).length, 1);

    await assert.rejects(
      insertUserRecord(tx, stored({ id: "dup", email: "ada.lane@masten.test", name: "Duplicate", role: "staff" })),
      /already exists/,
    );

    await changeUserRole(tx, "sam", "admin");
    await changeUserRole(tx, "ada", "staff");
    assert.equal((await tx.all("select role from users where id = 'ada'"))[0]?.role, "staff");
    await changeUserRole(tx, "ada", "admin");
    await removeUserRecord(tx, "ada");
    assert.equal((await tx.all("select id from users where id = 'ada'")).length, 0);
    assert.equal((await tx.all("select user_id from card_assignees where user_id = 'ada'")).length, 0);

    await assert.rejects(changeUserRole(tx, "sam", "staff"), /last admin/);
    await assert.rejects(removeUserRecord(tx, "sam"), /last admin/);
    assert.equal((await tx.all("select role from users where id = 'sam'"))[0]?.role, "admin");
    assert.equal((await tx.all("select user_id from card_assignees where user_id = 'sam'")).length, 1);

    await add(tx, { id: "jo", email: "jo.park@masten.test", name: "Jo Park", role: "staff" });
    await tx.run("insert into card_assignees (card_id, user_id) values ('card-jo', 'jo')");
    await removeUserRecord(tx, "jo");
    assert.equal((await tx.all("select id from users where id = 'jo'")).length, 0);
    assert.equal((await tx.all("select user_id from card_assignees where user_id = 'jo'")).length, 0);
    assert.equal((await tx.all("select id from users where id = 'sam'")).length, 1);
  });
});

function stored(user: { id: string; email: string; name: string; role: "admin" | "staff" }): PreparedUser & {
  id: string;
  createdAt: string;
} {
  return {
    ...user,
    passwordHash: "not-a-login-hash",
    createdAt: "2026-11-24T00:00:00.000Z",
  };
}

async function add(tx: Tx, user: { id: string; email: string; name: string; role: "admin" | "staff" }) {
  await insertUserRecord(tx, stored(user));
}

function openUsersDb(): { tx: Tx } {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    create table users (
      id text primary key,
      email text not null unique,
      name text not null,
      password_hash text not null,
      role text not null,
      created_at text not null
    );
    create table card_assignees (
      card_id text not null,
      user_id text not null,
      primary key (card_id, user_id)
    );
  `);
  const tx: Tx = {
    async all<T>(sql: string, args: (string | number | null)[] = []) {
      return db.prepare(sql).all(...args) as T[];
    },
    async run(sql: string, args: (string | number | null)[] = []) {
      db.prepare(sql).run(...args);
    },
  };
  return { tx };
}
