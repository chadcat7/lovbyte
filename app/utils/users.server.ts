import { redirect } from "@remix-run/node";
import { db } from "./db.server";
import { getUserAllDetails, getUserBlockedFriends, getUserId, updateUser } from "./session.server";
import { makeRoom, deleteRoom } from "./room.server";

export const getRandomUser = async (request: Request) => {
  const userId = await getUserId(request);
  const ids = await getUserBlockedFriends(request)
  if (typeof userId !== "string") {
    return redirect("/");
  }
  // @ts-expect-error
  const userIdsToExclude = [userId, ...ids?.liked, ...ids?.blocked, ...ids?.matched]
  const randomUser = await db.$runCommandRaw({
    "aggregate": "User",
    "cursor": {},
    "pipeline": [
      { "$match": { "_id": { "$nin": userIdsToExclude } } },
      { "$sample": { "size": 1 } }
    ]
  });
  // @ts-expect-error
  return randomUser.cursor.firstBatch[0];
}

export const getAllMatched = async (request: Request) => {
  const ids = await getUserBlockedFriends(request)
  const matched = ids?.matched
  const matches = []
  if (matched) {
    for (const person of matched) {
      const contents = await fetchUser(request, person);
      matches.push(contents)
    }
  }
  return matches
}

export const blockPerson = async (request: Request, username: string) => {
  const userdata = await getUserBlockedFriends(request)
  const person = await db.user.findUnique({
    select: { blocked: true, liked: true, matched: true, id: true },
    where: { username },
  });
  if (!userdata?.blocked.includes(username)) {
    await updateUser(request, { blocked: [...userdata?.blocked, username], liked: userdata?.liked.filter(x => x != username), matched: userdata?.matched.filter(x => x != username) })
    // await deleteRoom(request, person.id)
    return "success"
  } else {
    await updateUser(request, { blocked: userdata.blocked.filter(x => x != username) })
    return "success"
  }
}

export const getIdByName = async (username: string) => {
  const person = await db.user.findUnique({
    select: { id: true },
    where: { username },
  });
  return person
}

export const likePerson = async (request: Request, username: string) => {
  const userdata = await getUserBlockedFriends(request)
  const user = await getUserAllDetails(request)
  const person = await db.user.findUnique({
    select: { blocked: true, liked: true, matched: true, id: true },
    where: { username },
  });
  const matched = person?.liked.includes(String(user?.username))
  if (!person?.blocked.includes(String(user?.username))) {
    if (!userdata?.liked.includes(username)) {
      await updateUser(request, { matched: matched ? [...userdata?.matched, username] : [...userdata?.matched], liked: [...userdata?.liked, username], blocked: userdata?.blocked.filter(x => x != username) })
      if (matched) {
        await db.user.update({
          where: { username },
          data: { matched: [...person?.matched, user?.username] }
        })
        await makeRoom(request, String(person?.id))
      }
      return "success"
    } else {
      await updateUser(request, { matched: userdata.matched.filter(x => x != username), liked: userdata.liked.filter(x => x != username) })
      if (matched) {
        await db.user.update({
          where: { username },
          data: { matched: person?.matched.filter(x => x != user?.username) }
        })
        // await deleteRoom(request, person.id)
      }
      return "success"
    }
  }
}

export async function fetchUser(request: Request, name: string) {
  const userId = await getUserId(request);
  if (typeof userId !== "string") {
    return null;
  }

  const user = await db.user.findUnique({
    select: { twitter: true, id: true, github: true, tech: true, pronouns: true, name: true, username: true, bio: true, dob: true, pfp: true, personalSite: true },
    where: { username: name },
  });


  const projects = await db.project.findMany({
    select: { name: true, image: true, description: true, url: true },
    where: { userId: user?.id },
  });

  if (!user) {
    return null
  }
  if (user.id == userId) {
    return null
  }

  return { user: { ...user, id: '' }, projects };
}
