// One CUDA thread derives one PrivateBin PBKDF2-HMAC-SHA256 key.
typedef unsigned int uint32_t;
typedef unsigned long long uint64_t;

__constant__ uint32_t K[64] = {
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
};

__device__ __forceinline__ uint32_t rotr(uint32_t x, int n) { return (x >> n) | (x << (32 - n)); }
__device__ __forceinline__ void init(uint32_t s[8]) {
  s[0]=0x6a09e667; s[1]=0xbb67ae85; s[2]=0x3c6ef372; s[3]=0xa54ff53a;
  s[4]=0x510e527f; s[5]=0x9b05688c; s[6]=0x1f83d9ab; s[7]=0x5be0cd19;
}
__device__ __forceinline__ void compress(uint32_t s[8], const unsigned char b[64]) {
  uint32_t w[64];
  for (int i=0;i<16;i++) w[i]=((uint32_t)b[4*i]<<24)|((uint32_t)b[4*i+1]<<16)|((uint32_t)b[4*i+2]<<8)|b[4*i+3];
  for (int i=16;i<64;i++) {
    uint32_t x=w[i-15], y=w[i-2];
    w[i]=(rotr(y,17)^rotr(y,19)^(y>>10))+w[i-7]+(rotr(x,7)^rotr(x,18)^(x>>3))+w[i-16];
  }
  uint32_t a=s[0],c=s[2],d=s[3],e=s[4],f=s[5],g=s[6],h=s[7],bb=s[1];
  for (int i=0;i<64;i++) {
    uint32_t t1=h+(rotr(e,6)^rotr(e,11)^rotr(e,25))+((e&f)^(~e&g))+K[i]+w[i];
    uint32_t t2=(rotr(a,2)^rotr(a,13)^rotr(a,22))+((a&bb)^(a&c)^(bb&c));
    h=g;g=f;f=e;e=d+t1;d=c;c=bb;bb=a;a=t1+t2;
  }
  s[0]+=a;s[1]+=bb;s[2]+=c;s[3]+=d;s[4]+=e;s[5]+=f;s[6]+=g;s[7]+=h;
}
__device__ __forceinline__ void words_to_bytes(const uint32_t s[8], unsigned char out[32]) {
  for(int i=0;i<8;i++) { out[4*i]=s[i]>>24; out[4*i+1]=s[i]>>16; out[4*i+2]=s[i]>>8; out[4*i+3]=s[i]; }
}
__device__ void hash_key(const unsigned char *data, int len, unsigned char out[32]) {
  uint32_t s[8]; init(s);
  int offset=0;
  while (len-offset>=64) { unsigned char b[64]; for(int i=0;i<64;i++) b[i]=data[offset+i]; compress(s,b); offset+=64; }
  unsigned char b[64]; int rest=len-offset;
  for(int i=0;i<64;i++) b[i]=i<rest?data[offset+i]:0;
  b[rest]=0x80;
  if(rest>=56) { compress(s,b); for(int i=0;i<64;i++) b[i]=0; }
  uint64_t bits=(uint64_t)len*8;
  for(int i=0;i<8;i++) b[56+i]=(unsigned char)(bits>>(56-8*i));
  compress(s,b); words_to_bytes(s,out);
}
__device__ __forceinline__ void hmac_short(const uint32_t inner[8],const uint32_t outer[8],
                                             const unsigned char *message,int len,unsigned char out[32]) {
  unsigned char b[64];
  for(int i=0;i<64;i++) b[i]=i<len?message[i]:0;
  b[len]=0x80;
  uint64_t bits=(uint64_t)(64+len)*8;
  for(int i=0;i<8;i++) b[56+i]=(unsigned char)(bits>>(56-8*i));
  uint32_t s[8];for(int i=0;i<8;i++)s[i]=inner[i]; compress(s,b);
  words_to_bytes(s,out);
  for(int i=0;i<64;i++)b[i]=i<32?out[i]:0;
  b[32]=0x80;
  bits=(64+32)*8;
  for(int i=0;i<8;i++)b[56+i]=(unsigned char)(bits>>(56-8*i));
  for(int i=0;i<8;i++)s[i]=outer[i]; compress(s,b);
  words_to_bytes(s,out);
}

extern "C" __global__ void pbkdf2_batch(const unsigned char *phrases,const int *lengths,int stride,
  const unsigned char *salt,int salt_len,int iterations,int count,unsigned char *output) {
  int index=blockIdx.x*blockDim.x+threadIdx.x;
  if(index>=count)return;
  const unsigned char *phrase=phrases+index*stride;
  int len=lengths[index];
  unsigned char key[64];for(int i=0;i<64;i++)key[i]=0;
  if(len>64) { unsigned char digest[32];hash_key(phrase,len,digest);for(int i=0;i<32;i++)key[i]=digest[i]; }
  else for(int i=0;i<len;i++)key[i]=phrase[i];
  unsigned char b[64];uint32_t inner[8],outer[8];init(inner);init(outer);
  for(int i=0;i<64;i++)b[i]=key[i]^0x36;compress(inner,b);
  for(int i=0;i<64;i++)b[i]=key[i]^0x5c;compress(outer,b);
  unsigned char message[55],u[32],acc[32];
  for(int i=0;i<salt_len;i++)message[i]=salt[i];
  message[salt_len]=0;message[salt_len+1]=0;message[salt_len+2]=0;message[salt_len+3]=1;
  hmac_short(inner,outer,message,salt_len+4,u);
  for(int i=0;i<32;i++)acc[i]=u[i];
  for(int j=1;j<iterations;j++) { hmac_short(inner,outer,u,32,u);for(int i=0;i<32;i++)acc[i]^=u[i]; }
  for(int i=0;i<32;i++)output[index*32+i]=acc[i];
}
