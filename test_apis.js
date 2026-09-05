async function test() {
  try {
    const dolar = await fetch('https://dolarapi.com/v1/dolares');
    console.log("DolarAPI:", dolar.status);
    
    const crypto = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,tether&vs_currencies=usd');
    console.log("CoinGecko:", crypto.status);
    
    const astro = await fetch('https://api.sunrise-sunset.org/json?lat=-34.6&lng=-58.4&formatted=0');
    console.log("Astro:", astro.status);
  } catch (e) {
    console.error(e);
  }
}
test();
