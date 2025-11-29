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

