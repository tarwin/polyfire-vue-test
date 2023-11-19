<template>
  <AppProvider>
    <div v-if="!isAuthenticated">
      Loggin in ...
    </div>
    <Page v-else title="Polyfire Vue">

      <Banner v-if="error" status="critical">
        {{ error }}
      </Banner>

      <Card>
        <CardSection title="Chat Window ...">
          <div id="ChatAnswersWrapper">
            <div id="ChatAnswers" v-html="chatAnswer" class="ChatWindow"></div>
          </div>
        </CardSection>
        <CardSection>
          <FormLayout>
            <Checkbox label="Stream?" v-model="chatOptions.stream">Stream</Checkbox>
          </FormLayout>
        </CardSection>
        <CardSection>
          <FormLayout>
            <TextField
              id="ChatQuestionField"
              ref="chatQuestion"
              label="Let's chat!"
              v-model="chatQuestion"
              :multiline="4"
              :disabled="isAsking"
              @keydown="chatKeyDown"
            />
            <Button @click="askChat" fullWidth :loading="isAsking">Chat (Cmd + ENTER)</Button>
          </FormLayout>
        </CardSection>
      </Card>

    </Page>
  </AppProvider>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import PolyfireClientBuilder from 'polyfire-js'
import { type Client, Chat } from 'polyfire-js'
import { marked } from 'marked'
import dayjs from 'dayjs'
import dayjsRelativeTime from 'dayjs/plugin/relativeTime'
dayjs.extend(dayjsRelativeTime)

export default defineComponent({
  data() {
    return {
      polyfire: null as Client | null,
      chatClient: null as Chat | null,

      isAuthenticated: false,
      error: '',

      isAsking: false,
      question: '',
      answer: '',

      chatQuestion: 'Are dogs real?',
      chatAnswer: '',
      chatAnswers: [] as {
        type: 'question' | 'answer',
        text: string,
        date: number,
        imageUrl?: string,
      }[],

      chatOptions: {
        stream: true
      },
      imageUrl: '',
    }
  },
  async mounted() {
    this.polyfire = PolyfireClientBuilder({ project: '<APP_ID>' })

    this.isAuthenticated = await this.polyfire.auth.init()
    if (!this.isAuthenticated) {
      // BUG: "google" did not seem to work
      await this.polyfire.auth.login('github')
    }

    // BUG: does system prompt work?
    this.chatClient = new this.polyfire.utils.Chat({
      systemPrompt: `
        You are an agent that is here to help the user create a children's book.
        Start by asking the user what they want the story to be about. Give examples such as "A baby Kangaroo called Kena" or "A dog who lost his bone".
        Once the user has given you a story prompt, ask them what style of images they want. Give examples such as "cartoon" or "realistic".
        Once they have given you a style, write a short story given the story prompt.
      `,
    })
   
    // BUG: seems to be global
    // console.log(await this.polyfire.data.kv.get('test'));
    // console.log(await this.polyfire.data.kv.set('test', 'test2'));
    // console.log(await this.polyfire.data.kv.get('test'));
  },
  methods: {
    niceDate(date: number) {
      return dayjs(date).fromNow()
    },
    chatKeyDown(e: KeyboardEvent) {
      if (this.isAsking) return
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        this.askChat()
      }
    },
    async askChat() {
      this.chatAnswers.push({
        type: 'question',
        text: this.chatQuestion,
        date: Date.now(),
      })
      this.buildChatAnswer()
      this.scrollChatToEnd()
      this.error = ''
      try {
        this.isAsking = true

        if (this.chatOptions.stream) {
          // BUG: stream should be allowed?
          const resultStream = this.chatClient?.sendMessage(
            this.chatQuestion,
            { stream: true }
          )
          if (!resultStream) throw new Error('No result stream')
          
          const answerOb = {
            type: 'answer' as const,
            text: '',
            date: Date.now(),
            imageUrl: ''
          }
          this.chatAnswers.push(answerOb)

          resultStream.on('data', (d:string) => {
            answerOb.text += d
            this.chatAnswers.splice(this.chatAnswers.length - 1, 1, answerOb)
            this.buildChatAnswer()
            this.scrollChatToEnd()
          })

          await new Promise((res) => resultStream.on('end', () => res(0)))

          // get a nice prompt for image
          const imageDesciption = await this.polyfire!.models.generate(`
            Please generate a description for a beautiful looking image that represents the following text:
          
            ${answerOb.text}
          `)
          // console.log('imageDesciption', imageDesciption)

          // BUG: should not require options
          const image = await this.polyfire?.models.generateImage(imageDesciption, {})
          if (image) {
            answerOb.imageUrl = image.url
          }
        } else {
          const chatAnswer = await this.chatClient?.sendMessage(this.chatQuestion)
          if (chatAnswer) {
            this.chatAnswers.push({
              type: 'answer',
              text: chatAnswer,
              date: Date.now(),
            })
          } else {
            this.chatAnswers.push({
              type: 'answer',
              text: `__Sorry, I don't know the answer to that question.__`,
              date: Date.now(),
            })
          }
        }

        this.buildChatAnswer()

        this.chatQuestion = ''
        this.isAsking = false
        this.$nextTick(() => {
          this.focusChatInput()
          this.scrollChatToEnd()
        })
      } catch (e:any) {
        console.log(e)
        this.error = e.message
        this.isAsking = false
      }
    },
    focusChatInput() {
      (document.querySelector('#ChatQuestionField') as HTMLElement)?.focus()
    },
    scrollChatToEnd() {
      const chatOutput = (document.querySelector('#ChatAnswers') as HTMLElement)
      chatOutput.scrollTop = chatOutput.scrollHeight
    },
    markdownToHtml(markdown: string) {
      return marked.parse(markdown)
    },
    buildChatAnswer() {
      let out = ``
      for (const answer of this.chatAnswers) {
        if (answer.type === 'question') {
          out += `
            <div class="ChatQuestion">
              <h1>User - ${this.niceDate(answer.date)}</h1>
              ${this.markdownToHtml(answer.text)}
            </div>
          `
        } else {
          out += `
            <div class="ChatAnswer">
              <div>
                <h1>Bot - ${this.niceDate(answer.date)}</h1>
                ${this.markdownToHtml(answer.text)}
              </div>
              <div>${answer.imageUrl ? `<img src="${answer.imageUrl}" />` : ''}</div>
            </div>
          `
        }
      }
      this.chatAnswer = out
    },
  },
  computed: {
  }
})

</script>

<style lang="scss">
.ChatWindow {
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 8px;
  margin-bottom: 8px;
  min-height: 200px;
  overflow-y: scroll;
  max-height: calc(100vh - 530px);
}

.ChatQuestion, .ChatAnswer {
  margin-bottom: 32px;
  h1 {
    font-weight: bold;
    margin-bottom: 8px;
  }
  p {
    margin-bottom: 8px;
  }
}

#ChatAnswers {
  .ChatAnswer {
    display: grid;
    grid-template-columns: 1fr 256px;
    gap: 16px;
  }
  img {
    max-width: 256px;
  }
}
</style>