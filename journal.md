## notes

Started on Kiro panel, in specs, pressed `+`. This text dialog closes when you switch tabs. I only found out after typing out the initial promp and switching tabs to double check the name of a service I wanted to use. That cost me ~15 mins.

I usually type prompts out in a separate text file. Seems like that's the workflow for Kiro too.

> ❓ It's unclear where I should start. Should I press new spec? Should I use the Cursor-style chat sidebar? What's the difference?

I added all of the required user flows in EARS notation in my prompt, so the AI didn't have to guess.

Ended up using a new chat session. It created a spec from my prompt. I glossed over it and it seemed to match my expectations, though it was mainly my initial prompt re-organised. Looks like the initial prompt is very important.

I left a list of documentation URLs in my initial prompt, which were not used in any of the steps. I think this is a mistake from Kiro. Documentation URLs like these should be respected

Keep optional tasks prompt: Kiro asked me if I want to do all tasks initially, or skip optional tasks. This is phrased a bit confusingly. I understood the concept, because I've worked with Claude Code plan mode for some time now.

I like the task list. I don't think the AI did the best job splitting it up into deliverables. My project could be split into 3 major milestones:

1. Setting up the full-stack app (NextJS)
2. Implementing linking with Linear
3. Adding AI enhancements via LiquidMetal

I like that it asks 

Instead for the initial task, it decided to set the entire environment up, including Linear and LiquidMetal. There's no real benefit to doing it this way, and it wasted about 1.5 credits on adding the features we won't get to use.

It also spent about 0.9 credits on setting up testing, when it made me agree not to add tests before the task creation phase.

Ran into this issue:

> I've been trying to use "executeBash" but it's failed 7 times in a row. I'm clearly stuck in a loop.

This would be fine, except it did run bash 7 times, but it succeeded 6 times and only failed once. I believe there's an issue in how it counts bash commands as failures. It ran 6 separate commands too, so clearly the LLM knows when it gets past a step, but there's some built in logic that catches it regardless.

It added ESLint, when it started with NextJS init, which already includes this - useless step.

Adds `.gitkeep` to empty directories, when it doesn't commit. This is a useless step.

Decides to build the empty NextJS project.

Added a completely no-op test file that defines an `add` utility and then checks if it works. Again, I asked for no tests (which it suggested during setup), why is it wasting all this effort on tests is beyond me.

Looks like it uses Claude Sonnet. I know this because of the cancer emoji spam in the ourput.

At this point we've successfully reproduced the same thing we'd get from using `npx create-next-app`, spending:

```
Credits used: 4.13
Elapsed time: 45m 41s
```

The toolbar at the bottom of the editor does not stay up to date with credit use. I'd just remove it because it's confusing.

I started Task 2.

Looks like it uses separate contexts for each tasks, because it starts each time by reading what's already available. Context angineering seems to be fully abstracted away. I'm not sure I like this. I'm pretty good at managing context and giving me more control would benefit me.

It very stupidly hand-rolled authentication (based on very outdated information), instead of just installing `"@workos-inc/authkit-nextjs"`, which handles all of this out of the box. I decided to re-write authentication to use the WorkOS-recommended setup. I know from experience that diverging from this will bite me later on.

This is where the docs I mentioned above would've helped. Kiro should prioritise including these, or even reading them and informing its implementation path based on them, when the user requests this.

Still runs tests after every task, even though they're just placeholders. Very happy that the tests pass too.

In the default dark mode in the editor, it's not apparent what files and directories are `.gitignore`d. I think this is a major security flaw.

Extraneous entries in `.env.local`, e.g.:

```
# Database Configuration (for session storage)
DATABASE_URL=
```

(we're not using a database)

Not using Prettier for a TypeScript project in 2025 is criminal. Kiro should be sent to jail for this.

Ended up just re-rolling auth from scratch, since the Kiro setup was totally unusable. Took 22 minutes for Kiro to complete its auth implementation, took me 12 minutes to delete it all and set it up using WorkOS docs.

When you have something running in the terminal, when Kiro tries to run commands, it just sends them to stdin of that process, instead of creating a new terminal. This is incredibly useless, since most everyone will want to have something running while they're working on a project.


## Linear implementation

Again, a key principle I requested was ignored. I asked for it to implement actor authentication, instead of trying to impersonate a user. This is key to making this whole project work. This is also something where I linked the docs (which were ignored).

It also based persistence on its brittle hand-rolled WorkOS integration based on updated JWTs in cookies. I decided to try vibe coding to fix this.

> At this point it's apparent that Kiro ***DOES NOT CHECK THE INTERNET***. I think this is a major flaw and it makes it close to useless at implementing anything meaningful. It does put links in comments, though, which I find funny.

Another fucky thing is that it left a MIGRATION_NOTES.md, that's almost longer than the entire code output. There's very little use in these in fully agent-driven environments. Adding legacy information for posterity can be nice for humans, but it greatly reduces the quality of output for LLMs. It also wasted a bunch of tokens on this.

I had to manually edit the implementation in a few places, because it does not check linter output and does not look up web pages. If it just followed the website I've sent it, it would've been able to one-shot this task no problem.

Vibe coding use:

```
Credits used: 2.46
Elapsed time: 4m 5s
```

## Linear onboarding

As a common theme, it once again - attempted to add completely useless tests to the tune of importing functions from other modules and checking if their type is of `"function"`. It then failed to run these tests, since it tried to import modules from auto-generated NextJS directories. It then deleted the new tests, ran the old test stubs and finally celebrated itself for making all tests pass.

It also did something it hadn't done before: it actually started building UI. This is great, because the human in the loop finally gets to interact with the app. If you check commit history, you'll see there was UI committed, however, this is just random stuff I added to allow me to test sign up and sign out end to end. Without these makeshift UIs, I'd have had no way to verify anything works until now.

Something that Claude Code does very well: it instructs you to update parts where you're missing credentials, like API keys, tokens etc. I've not seen this from Kiro yet. It has incredibly verbose output, with a lot of waffling on about what it's done, yet it omits this very important info.

I like the speed of iteration in Kiro. It's the fastest I've seen so far of any IDE-based vibe coding product. I don't think the specs are detailed enough for it to be able to delegate work like this to super-cheap models, like Claude Haiku. Then again, the quality of the output is sub-par at best, and entirely useless at worst (see the initial WorkOS integration).

Anecdotally, it could work really well, if it produced more in-depth specs. It's also very interesting how it directs itself to skip tests, yet it seems like the entire methodology behind Kiro is set up around tests, so it's constatly doing the equivalent of dangling its feet above a puddle and gloating about being an olympic swimming champion.

> I just can't place Kiro. If it's truly for vibe coders, it's nowhere near noob-friendly enough. It doesn't guide the user through the steps they need to take to make apps like this work. If it's for advanced software engineers, it's just a crappy tool. It really needs to have internet access. Without it, it's almost entirely useless.

At this point I need to acquire an app ID and token from Linear. I have no idea how to do this. Linear docs are not very forthcoming about this process. I'd expect Kiro to find this out for me and output a guide or something. I'm nervous to ask though. I know it won't search the internet, so the information will most likely be wrong. I'm at 18.37 credits used at this point. I'm afraid it won't finish this tiny project with the 50 credits I have access to.

Another thing I really hate about how Kiro set this project up, is that it adds an API route for everything. In NextJS 16, the only remaining use-case for API routes is if it needs to have a stable URL that makes it accessible for outside use-cases. Most API routes Kiro added do not meet that criteria. I don't know how to make Kiro aware of this. I'm going to try vibe coding a fix for this, because it makes the entire app logic brittle to file renames and adds needless maintenance overhead.

I've used this prompt to get it to refactor our unnecessary API routes:

```
In this project, so far you've added an API route every time you needed to fetch data for the client. In NextJS 16 the only valid use case for an API route is if we want to explicitly expose that endpoint to an outside actor. For data fetching, you should do it top-level in async function components in routes, for actions, we should create an api.ts file with "use server" that can be used to expose individual functions, that can be called from the client. Go through each API route, determine if they should be an API route. For authentication (callbacks) and webhook-related endpoint, they need to have a stable URL for third-party apps to call. For everything else, move the logic over to just server functions and remove the unnecessary API routes.
```

There's a bug I want to debug. When onboarding, as soon as it tries to create the tone of voice document, it fails, seemingly with the wrong project ID (for the initiative). I'm going to use the simplified structure that the vibe coding prompt left me with to debug this.

Kiro actually did a great job with this migration task. Everything seems to work as before and we now have server actions, instead of API routes. I'm interested to see if it's going to keep setting up API routes for future tasks. It is also by far the fastest tool I've used. I've noticed it has an unsafe file edit function. Instead of checking like Claude Code or Cursor do, it just overwrites whatever is currently in the file. This makes it not a great companion for coding alongside, but it speeds it up immensely. I like this trade-off for fully hands-off workflows.

Annoyingly, I read the code that tried to set the tone of voice document up, and it turned out it was the dumbest bug:

```ts
// Create the document
const payload = await client.createDocument({
  title: TONE_OF_VOICE_TITLE,
  content: DEFAULT_TONE_OF_VOICE_CONTENT,
  projectId: initiativeId,
});
```

Instead of:

```ts
// Create the document
const payload = await client.createDocument({
  title: TONE_OF_VOICE_TITLE,
  content: DEFAULT_TONE_OF_VOICE_CONTENT,
  initiativeId,
});
```

This clearly failed, since Linear couldn't find a project with our initiative ID. I'm so surprised it failed on something so trivial, while it set some pretty complex workflows up, including an onboarding flow that depends on multiple third-parties playing ball.

## Showing actual job listings

I've decided to edit the task list, since it was coupled to the concept of API routes. New tasks focused on building pages. The hope is that Kiro picks up on the project already being heavily built on server actions (since the refactor) and it adjusts its expectations (that produced the initial API-route oriented approach).

I can't help but follow Kiro's progress. I'm noticing a lot of usages of deprecated Linear SDK methods and attributes. About half of the properties it used weren't even available anymore. I'm going to have to fix this by hand once it's done. Interestingly it does check diagnostics, but it doesn't do much with the output and it'll happily leave them red and claim the task is done.

We don't yet have the AI enhanced workflow set up. This is fine. I'm testing the new pages Kiro set up, by creating some test projects in Linear.

The nastiest mistake it made is - again - rather than taking 2 seconds to check online what the right API is for Linear, it failed to add the right heuristic for checking project status. It cooked up a random check that's in no way accurate:

```ts
/**
 * Check if a project has "In Progress" status
 * In Linear, we check the project's progress/status
 */
async function isProjectInProgress(project: Project): Promise<boolean> {
  // Linear projects have a progress field that can be checked
  // For now, we'll use a simple heuristic based on the project's state
  // In a real implementation, you'd check against the actual workflow state
  
  // Check if project has started and is not completed
  const progress = project.progress;
  
  // A project is "In Progress" if it has some progress but is not complete
  // progress is a number between 0 and 1
  return progress > 0 && progress < 1;
}
```

Instead, all it had to do was this:

```ts
/**
 * Check if a project has "In Progress" status
 * In Linear, we check the project's status
 */
async function isProjectInProgress(project: Project): Promise<boolean> {
  // Check if project has started and is not completed
  const status = await project.status;
  
  // A project is "In Progress" if it has some progress but is not complete
  // progress is a number between 0 and 1
  return status?.name === "In Progress";
}
```

Another key error in its implementation is this:

```ts
/**
 * Get published jobs for a specific Linear organization
 * This is used for the public job board
 */
export async function getPublishedJobsByOrg(_linearOrgId: string): Promise<JobListing[]> {
  // For now, we'll use the authenticated user's context
  // In a production system, you might want to cache this data
  // or use a different approach for public access
  return await getPublishedJobs();
}
```

The oversight here, is that we actually have a Linear app, which is authenticated to fetch projects from this workspace, so we don't need the user's token here at all. We can just authenticate as "the app" and fetch projects that way. I'm giving vibe coding mode another chance to shine on this task.

Credit usage for this task:

```
Credits used: 5.54
Elapsed time: 4m 46s
```

Interestingly, credit usage does not seem to go up as the project advances. If this is based off of token usage, a comparison I can make here is Claude Code and Cursor, both of which use more and more tokens as the project grows as they find more files to read randomly without intent. Seems like Kiro does not suffer from side-quest fever.

Upon a bit of research, turns out I was wrong about Linear API access via authorised apps. What I need to do is when the user first authenticates, I also need to associate the workspace with the access token I get from Linear. I can then look this up on unathenticated requests.

The approach I took here - mostly using vibe code - bit of hand-coding where I felt like the LLM struggled to comprehend: add Upstash Redis as a layer to store all of the config we initially stored on each user object. This way we can imprersonate users when we need unauthenticated access. This will helps us in the next steps when we want to actually create Linear issues from submissions.

## Application form

Tried out-of-order task running. All requirements were met, so this task could be completed by Kiro. Still seems to be obsessed with building API routes, even if not explicitly told so, and/or if server functions are mentioned. I'd rather not start adding "DO NOT USE API ROUTES" in the tasks, but it seems like I might need to. This time I interrupted it and asked it to use server actions and it obliged.

```
The implementation follows Next.js 14+ best practices with server actions, providing a seamless user experience with proper validation at both client and server levels.
```

...Says Kiro. Our Next.js version is 16. Seems like it's maybe not aware, or just trying to generalise?

I also realised I can just ask Kiro to update tasks. I've asked it to split 9, which was arbitrarily split into 9.1 and 9.2 to instead be split based on Linear (9.1) and LiquidMetal (9.2) to allow me to work on these separately.

## Submitting the form

Even though this task was quite well-defined and small, compared to the previous ones, we could observe how Kiro ramped up token (sorry, credit) usage:

```
Credits used: 1.55 (?)
Elapsed time: 1m 31s
```

On previous tasks, Kiro jumped head-first into implementation, without much thought. This time it did quite a lot of research. Most importantly, it used server actions, without me having to prompt it to in addition to the task.

The form worked on the first try and it successfully added a new issue in Linear, which is fantastic! It did disregard my original ask though. I clearly asked it to upload documents as attachments to Linear. It decided to go another route and assume it could just use SmartBucket later on:

```ts
// Note: Linear SDK doesn't directly support file uploads via API
// The document is created with metadata about the file
// For actual file storage, we would need to use Linear's file upload endpoint
// or integrate with SmartBuckets (which will be done in task 9.2)

// For now, we store the file metadata in the document
// Task 9.2 will implement SmartBuckets integration for actual file storage
```

I'm not sure why it refused to use Linear's file upload endpoint. I ended prompting vibe coding mode to implement this properly. Again, the refusal to use the internet for help really hurt it. It took it 8 tries to get it right. Linear uses a very simple signed URL approach for file uploads and what's cool, is that the SDK comes with the URL generator built-in, so all one has to do, is send a POST request with the information returned from the SDK call.

I decided to use Cerebras for inference, since I couldn't figure out what LiquidMetal is, or what it's supposed to do. Asking ChatGPT and Gemini yields more confusion. Their docs are horribly structured, so it's no wonder LLMs can't figure them out.

I knew that Kiro refusing to use the internet would seriously hurt this part, since a lot of these APIs and SDKs are only weeks old. The models won't have that "knowledge" yet, so it would just hallucinate endlessly. I hand-coded an example, that improves job descriptions. This covers all of the API surface required for the rest of the text inference features. Interested to see if Kiro's able to pick up on this.

My plan also seriously diverged from what's in `tasks.md`. I decided to vibe code (because I trust this mode more vs plan mode) one end-to-end example and then prompt spec mode to update the spec, based on the existing working implementation.